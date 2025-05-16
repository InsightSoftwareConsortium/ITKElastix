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
#include "itkOutputTransform.h"
#include "itkInputTransform.h"

#include "itkImage.h"
#include "itkIdentityTransform.h"
#include "itkCompositeTransform.h"
#include "itkCompositeTransformIOHelper.h"
#include "itkCastImageFilter.h"

#include <sstream>

#include "itkElastixWasmParameterObject.h"
#include "glaze/glaze.hpp"

std::string readParameterObject(const std::string & parameterObjectJson, elastix::ParameterObject * parameterObject)
{
  using ParameterObjectType = elastix::ParameterObject;

  itk::wasm::ParameterMapVector wasmParameterMaps;
  auto errorCode = glz::read_json<itk::wasm::ParameterMapVector>(wasmParameterMaps, parameterObjectJson);
  if (errorCode)
  {
    const std::string errorMessage = glz::format_error(errorCode, parameterObjectJson);
    return errorMessage;
  }

  const auto numParameterMaps = wasmParameterMaps.size();
  ParameterObjectType::ParameterMapVectorType parameterMaps;
  parameterMaps.reserve(numParameterMaps);
  for (const auto wasmParameterMap : wasmParameterMaps)
  {
    ParameterObjectType::ParameterMapType parameterMap;
    for (const auto & parameter : wasmParameterMap)
    {
      ParameterObjectType::ParameterValueVectorType parameterValues;
      for (const auto & value : parameter.second)
      {
        if (value.index() == 0)
        {
          const auto & valueString = std::get<std::string>(value);
          parameterValues.push_back(valueString);
        }
        else if (value.index() == 1)
        {
          const auto & valueBool = std::get<bool>(value);
          if (valueBool)
          {
            parameterValues.push_back("true");
          }
          else
          {
            parameterValues.push_back("false");
          }
        }
        else if (value.index() == 2)
        {
          const auto & valueInt = std::get<int64_t>(value);
          parameterValues.push_back(std::to_string(valueInt));
        }
        else if (value.index() == 3)
        {
          const auto & valueDouble = std::get<double>(value);
          parameterValues.push_back(std::to_string(valueDouble));
        }
      }
      parameterMap[parameter.first] = parameterValues;
    }

    parameterObject->AddParameterMap(parameterMap);
  }

  return {};
}

template <typename TImage>
class PipelineFunctor
{
public:
  int
  operator()(itk::wasm::Pipeline & pipeline)
  {
    using ImageType = TImage;
    using ParametersValueType = double;
    using FloatImageType = itk::Image<float, ImageType::ImageDimension>;
    using RegistrationType = itk::ElastixRegistrationMethod<FloatImageType, FloatImageType>;
    using TransformType = typename RegistrationType::TransformType;
    using CompositeTransformType = itk::CompositeTransform<ParametersValueType, ImageType::ImageDimension>;
    using CompositeHelperType = itk::CompositeTransformIOHelperTemplate<ParametersValueType>;

    using InputImageType = itk::wasm::InputImage<ImageType>;
    InputImageType fixedImage;
    pipeline.add_option("-f,--fixed", fixedImage, "Fixed image")->type_name("INPUT_IMAGE");

    InputImageType movingImage;
    pipeline.add_option("-m,--moving", movingImage, "Moving image")->type_name("INPUT_IMAGE");

    using InputTransformType = itk::wasm::InputTransform<CompositeTransformType>;
    InputTransformType initialTransform;
    pipeline
      .add_option("-i,--initial-transform", initialTransform, "Initial transform to apply before registration")
      ->type_name("INPUT_TRANSFORM");

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

    using OutputTransformType = itk::wasm::OutputTransform<TransformType>;
    OutputTransformType outputTransform;
    pipeline.add_option("transform", outputTransform, "Fixed-to-moving transform file")
      ->required()
      ->type_name("OUTPUT_TRANSFORM");

    itk::wasm::OutputTextStream transformParameterObjectJson;
    pipeline
      .add_option("transform-parameter-object",
                  transformParameterObjectJson,
                  "Elastix optimized transform parameter object representation")
      ->required()
      ->type_name("OUTPUT_JSON");

    ITK_WASM_PARSE(pipeline);

    using CasterType = itk::CastImageFilter<ImageType, FloatImageType>;

    typename CasterType::Pointer fixedCaster = CasterType::New();
    fixedCaster->SetInput(fixedImage.Get());
    ITK_WASM_CATCH_EXCEPTION(pipeline, fixedCaster->Update());

    typename CasterType::Pointer movingCaster = CasterType::New();
    movingCaster->SetInput(movingImage.Get());
    ITK_WASM_CATCH_EXCEPTION(pipeline, movingCaster->Update());

    typename RegistrationType::Pointer registration = RegistrationType::New();

    using ParameterObjectType = elastix::ParameterObject;
    const auto parameterObject = ParameterObjectType::New();
    std::stringstream   ss;
    ss << parameterObjectJson.Get().rdbuf();
    const std::string errorMessage = readParameterObject(ss.str(), parameterObject);
    if (!errorMessage.empty())
    {
      std::cerr << "Error reading parameter object JSON: " << errorMessage << std::endl;
      return EXIT_FAILURE;
    }

    auto fixed = const_cast<ImageType *>(fixedImage.Get());
    auto moving = const_cast<ImageType *>(movingImage.Get());
    registration->SetFixedImage(fixedCaster->GetOutput());
    registration->SetMovingImage(movingCaster->GetOutput());
    registration->SetParameterObject(parameterObject);

    typename RegistrationType::TransformType::Pointer externalInitialTransform;
    if (initialTransform.Get())
    {
      registration->SetExternalInitialTransform(const_cast<CompositeTransformType *>(initialTransform.Get()));
    }
    else if (!initialTransformParameterObjectOption->empty())
    {
      using ParameterObjectType = elastix::ParameterObject;
      const auto initialTransformParameterObject = ParameterObjectType::New();
      std::stringstream   ss;
      ss << initialTransformParameterObjectJson.Get().rdbuf();
      const std::string errorMessage = readParameterObject(ss.str(), initialTransformParameterObject);
      if (!errorMessage.empty())
      {
        std::cerr << "Error reading transform parameter object JSON: " << errorMessage << std::endl;
        return EXIT_FAILURE;
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

    if (registration->GetNumberOfTransforms() == 0)
    {
      using IdentityTransformType = itk::IdentityTransform<double, ImageType::ImageDimension>;
      typename IdentityTransformType::ConstPointer identity = IdentityTransformType::New();
      outputTransform.Set(identity);
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
      outputTransform.Set(registeredCompositeTransform);
    }

    const auto transformParameterObject = registration->GetTransformParameterObject();
    itk::wasm::ParameterMapVector transformParameterMaps;

    const auto numParameterMaps = parameterObject->GetNumberOfParameterMaps();
    for (unsigned int i = 0; i < numParameterMaps; ++i)
    {
      const auto &     parameterMap = parameterObject->GetParameterMap(i);
      itk::wasm::ParameterMap wasmParameterMap;
      for (const auto & parameter : parameterMap)
      {
        const auto & parameterValueVector = parameter.second;

        auto & wasmValues = wasmParameterMap[parameter.first];
        wasmValues.reserve(parameterValueVector.size());

        // Convert each string into the variant
        for (const auto & val : parameterValueVector)
        {
          wasmValues.emplace_back(val);
        }
      }
      transformParameterMaps.push_back(wasmParameterMap);
    }

    std::string serialized{};
    auto errorCode = glz::write<glz::opts{ .prettify = true }>(transformParameterMaps, serialized);
    if (errorCode)
    {
      const std::string errorMessage = glz::format_error(errorCode, serialized);
      std::cerr << "Error serializing parameter object: " << errorMessage << std::endl;
      return EXIT_FAILURE;
    }

    transformParameterObjectJson.Get() << serialized;

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
