/*=========================================================================
 *
 *  Copyright NumFOCUS
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *         https://www.apache.org/licenses/LICENSE-2.0.txt
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 *=========================================================================*/
#include "itkElastixRegistrationMethod.h"
#include "itkPipeline.h"
#include "itkInputImage.h"
#include "itkOutputImage.h"
#include "itkInputTextStream.h"
#include "itkOutputTextStream.h"
#include "itkSupportInputImageTypes.h"

#include "itkImage.h"
#include "itkTransformFileWriter.h"
#include "itkTransformFileReader.h"
#include "itkIdentityTransform.h"
#include "itkCompositeTransform.h"
#include "itkCompositeTransformIOHelper.h"
#include "itkCastImageFilter.h"

#include "rapidjson/document.h"
#include "rapidjson/prettywriter.h"
#include "rapidjson/stringbuffer.h"

#include <sstream>

template <typename TImage>
class PipelineFunctor
{
public:
  int
  operator()(itk::wasm::Pipeline & pipeline)
  {
    using ImageType = TImage;
    using ParametersValueType = double;

    using InputImageType = itk::wasm::InputImage<ImageType>;
    InputImageType fixedImage;
    pipeline.add_option("-f,--fixed", fixedImage, "Fixed image")->type_name("INPUT_IMAGE");

    InputImageType movingImage;
    pipeline.add_option("-m,--moving", movingImage, "Moving image")->type_name("INPUT_IMAGE");

    std::string initialTransformFile;
    pipeline
      .add_option("-i,--initial-transform", initialTransformFile, "Initial transform to apply before registration")
      ->type_name("INPUT_BINARY_FILE");

    itk::wasm::InputTextStream initialTransformParameterObjectJson;
    auto                       initialTransformParameterObjectOption =
      pipeline
        .add_option("-t,--initial-transform-parameter-object",
                    initialTransformParameterObjectJson,
                    "Initial elastix transform parameter object to apply before registration. Only provide this or an "
                    "initial transform.")
        ->type_name("INPUT_JSON");

    itk::wasm::InputTextStream parameterObjectJson;
    pipeline.add_option("parameter-object", parameterObjectJson, "Elastix parameter object representation")
      ->required()
      ->type_name("INPUT_JSON");

    using OutputImageType = itk::wasm::OutputImage<ImageType>;
    OutputImageType resultImage;
    pipeline.add_option("result", resultImage, "Resampled moving image")->required()->type_name("OUTPUT_IMAGE");

    std::string outputTransform;
    pipeline.add_option("transform", outputTransform, "Fixed-to-moving transform file")
      ->required()
      ->type_name("OUTPUT_BINARY_FILE");

    itk::wasm::OutputTextStream transformParameterObjectJson;
    pipeline
      .add_option("transform-parameter-object",
                  transformParameterObjectJson,
                  "Elastix optimized transform parameter object representation")
      ->required()
      ->type_name("OUTPUT_JSON");

    ITK_WASM_PARSE(pipeline);

    using FloatImageType = itk::Image<float, ImageType::ImageDimension>;
    using CasterType = itk::CastImageFilter<ImageType, FloatImageType>;

    typename CasterType::Pointer fixedCaster = CasterType::New();
    fixedCaster->SetInput(fixedImage.Get());
    ITK_WASM_CATCH_EXCEPTION(pipeline, fixedCaster->Update());

    typename CasterType::Pointer movingCaster = CasterType::New();
    movingCaster->SetInput(movingImage.Get());
    ITK_WASM_CATCH_EXCEPTION(pipeline, movingCaster->Update());

    using RegistrationType = itk::ElastixRegistrationMethod<FloatImageType, FloatImageType>;
    typename RegistrationType::Pointer registration = RegistrationType::New();

    rapidjson::Document document;
    std::stringstream   ss;
    ss << parameterObjectJson.Get().rdbuf();
    document.Parse(ss.str().c_str());

    using ParameterObjectType = elastix::ParameterObject;
    const auto parameterObject = ParameterObjectType::New();
    const auto numParameterMaps = document.Size();
    using ParameterMapType = std::map<std::string, std::vector<std::string>>;
    std::vector<ParameterMapType> parameterMaps;
    for (unsigned int i = 0; i < numParameterMaps; ++i)
    {
      const auto &     parameterMapJson = document[i];
      ParameterMapType parameterMap;
      for (auto it = parameterMapJson.MemberBegin(); it != parameterMapJson.MemberEnd(); ++it)
      {
        const auto &             key = it->name.GetString();
        const auto &             valueJson = it->value;
        std::vector<std::string> value;
        for (auto it2 = valueJson.Begin(); it2 != valueJson.End(); ++it2)
        {
          const auto & valueElement = it2->GetString();
          value.push_back(valueElement);
        }
        parameterMap[key] = value;
      }
      parameterObject->AddParameterMap(parameterMap);
    }

    auto fixed = const_cast<ImageType *>(fixedImage.Get());
    auto moving = const_cast<ImageType *>(movingImage.Get());
    registration->SetFixedImage(fixedCaster->GetOutput());
    registration->SetMovingImage(movingCaster->GetOutput());
    registration->SetParameterObject(parameterObject);

    typename RegistrationType::TransformType::Pointer initialTransform;
    using CompositeTransformType = itk::CompositeTransform<ParametersValueType, ImageType::ImageDimension>;
    using CompositeHelperType = itk::CompositeTransformIOHelperTemplate<ParametersValueType>;
    using TransformReaderType = itk::TransformFileReaderTemplate<ParametersValueType>;
    typename TransformReaderType::Pointer transformReader = TransformReaderType::New();
    if (!initialTransformFile.empty())
    {
      transformReader->SetFileName(initialTransformFile);
      ITK_WASM_CATCH_EXCEPTION(pipeline, transformReader->Update());

      if (transformReader->GetTransformList()->size() == 1)
      {
        auto firstTransform = transformReader->GetModifiableTransformList()->front();
        if (!strcmp(firstTransform->GetNameOfClass(), "CompositeTransform"))
        {
          initialTransform = static_cast<CompositeTransformType *>(firstTransform.GetPointer());
          registration->SetExternalInitialTransform(initialTransform);
        }
        // We could add support for other initial transform types here
        else
        {
          std::cerr << "Initial transform is not a composite transform, which is not currently supported." << std::endl;
          return EXIT_FAILURE;
        }
      }
      else if (transformReader->GetTransformList()->size() > 1)
      {
        CompositeHelperType                      helper;
        typename CompositeTransformType::Pointer compositeTransform = CompositeTransformType::New();
        helper.SetTransformList(compositeTransform, *transformReader->GetModifiableTransformList());
        initialTransform = compositeTransform;
        registration->SetExternalInitialTransform(initialTransform);
      }
    }
    else if (!initialTransformParameterObjectOption->empty())
    {
      rapidjson::Document initialDocument;
      std::stringstream   ss;
      ss << initialTransformParameterObjectJson.Get().rdbuf();
      initialDocument.Parse(ss.str().c_str());

      using ParameterObjectType = elastix::ParameterObject;
      const auto initialTransformParameterObject = ParameterObjectType::New();
      const auto numTransformParameterMaps = initialDocument.Size();
      using ParameterMapType = std::map<std::string, std::vector<std::string>>;
      std::vector<ParameterMapType> transformParameterMaps;
      for (unsigned int i = 0; i < numTransformParameterMaps; ++i)
      {
        const auto &     parameterMapJson = initialDocument[i];
        ParameterMapType parameterMap;
        for (auto it = parameterMapJson.MemberBegin(); it != parameterMapJson.MemberEnd(); ++it)
        {
          const auto &             key = it->name.GetString();
          const auto &             valueJson = it->value;
          std::vector<std::string> value;
          for (auto it2 = valueJson.Begin(); it2 != valueJson.End(); ++it2)
          {
            const auto & valueElement = it2->GetString();
            value.push_back(valueElement);
          }
          parameterMap[key] = value;
        }
        initialTransformParameterObject->AddParameterMap(parameterMap);
      }

      registration->SetInitialTransformParameterObject(initialTransformParameterObject);
    }


    ITK_WASM_CATCH_EXCEPTION(pipeline, registration->Update());

    typename FloatImageType::Pointer outputImage = registration->GetOutput();
    using ResultCasterType = itk::CastImageFilter<FloatImageType, ImageType>;
    typename ResultCasterType::Pointer resultCaster = ResultCasterType::New();
    resultCaster->SetInput(outputImage);
    ITK_WASM_CATCH_EXCEPTION(pipeline, resultCaster->Update());
    typename ImageType::ConstPointer result = resultCaster->GetOutput();
    resultImage.Set(result);

    const auto writer = itk::TransformFileWriter::New();

    if (registration->GetNumberOfTransforms() == 0)
    {
      using IdentityTransformType = itk::IdentityTransform<double, ImageType::ImageDimension>;
      typename IdentityTransformType::ConstPointer identity = IdentityTransformType::New();
      writer->SetInput(identity);
      writer->SetFileName(outputTransform);
      ITK_WASM_CATCH_EXCEPTION(pipeline, writer->Update());
    }
    // Reasonable to enable once we support injecting as an initial transform
    // else if (!initialTransform.GetPointer() && registration->GetNumberOfTransforms() == 1)
    // {
    //   auto transform = registration->GetNthTransform(0);
    //   typename RegistrationType::TransformType::ConstPointer registeredTransform =
    //     registration->ConvertToItkTransform(*transform);
    //   writer->SetInput(registeredTransform);
    //   writer->SetFileName(outputTransform);
    //   ITK_WASM_CATCH_EXCEPTION(pipeline, writer->Update());
    // }
    else
    {
      typename RegistrationType::TransformType::ConstPointer combinationTransform =
        registration->GetCombinationTransform();
      typename CompositeTransformType::Pointer registeredCompositeTransform =
        static_cast<CompositeTransformType *>(registration->ConvertToItkTransform(*combinationTransform).GetPointer());
      registeredCompositeTransform->FlattenTransformQueue();
      registeredCompositeTransform->SetAllTransformsToOptimizeOff();
      writer->SetInput(registeredCompositeTransform);
      writer->SetFileName(outputTransform);
      ITK_WASM_CATCH_EXCEPTION(pipeline, writer->Update());
    }

    const auto          transformParameterObject = registration->GetTransformParameterObject();
    rapidjson::Document transformDocument;
    transformDocument.SetArray();
    rapidjson::Document::AllocatorType & allocator = transformDocument.GetAllocator();

    const auto numTransformParameterMaps = transformParameterObject->GetNumberOfParameterMaps();
    for (unsigned int i = 0; i < numTransformParameterMaps; ++i)
    {
      const auto &     parameterMap = transformParameterObject->GetParameterMap(i);
      rapidjson::Value parameterMapJson(rapidjson::kObjectType);
      for (const auto & parameter : parameterMap)
      {
        const auto &     key = parameter.first;
        const auto &     value = parameter.second;
        rapidjson::Value valueJson(rapidjson::kArrayType);
        for (const auto & valueElement : value)
        {
          valueJson.PushBack(rapidjson::Value(valueElement.c_str(), allocator).Move(), allocator);
        }
        parameterMapJson.AddMember(rapidjson::Value(key.c_str(), allocator).Move(), valueJson, allocator);
      }
      transformDocument.PushBack(parameterMapJson, allocator);
    }

    rapidjson::StringBuffer                          buffer;
    rapidjson::PrettyWriter<rapidjson::StringBuffer> transformParamWriter(buffer);
    transformDocument.Accept(transformParamWriter);

    transformParameterObjectJson.Get() << buffer.GetString();

    return EXIT_SUCCESS;
  }
};

int
main(int argc, char * argv[])
{
  itk::wasm::Pipeline pipeline("elastix", "Rigid and non-rigid registration of images.", argc, argv);

  return itk::wasm::SupportInputImageTypes<PipelineFunctor, uint8_t, uint16_t, int16_t, double, float>::
    Dimensions<2U, 3U, 4U>("-f,--fixed", pipeline);
}
