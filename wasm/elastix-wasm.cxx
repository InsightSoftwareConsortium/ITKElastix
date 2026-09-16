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

#include "itkImage.h"
#include "itkIdentityTransform.h"
#include "itkCompositeTransform.h"
#include "itkCastImageFilter.h"

#include <sstream>

#include "itkElastixWasmParameterObject.h"
#include "elastixReadInputTransform.h"
#include "glaze/glaze.hpp"

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

    // Declared before the pipeline outputs so that the registration outlives them: the outputs are
    // written when they go out of scope, and this ordering writes them while the registration that
    // produced them is still alive.
    typename RegistrationType::Pointer registration;

    using InputImageType = itk::wasm::InputImage<ImageType>;
    InputImageType fixedImage;
    pipeline.add_option("-f,--fixed", fixedImage, "Fixed image")->type_name("INPUT_IMAGE");

    InputImageType movingImage;
    pipeline.add_option("-m,--moving", movingImage, "Moving image")->type_name("INPUT_IMAGE");

    std::string initialTransformArg;
    pipeline
      .add_option("-i,--initial-transform",
                  initialTransformArg,
                  "Initial ITK transform to apply before registration. Only provide this or an initial transform "
                  "parameter object.")
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
    pipeline.add_option("transform", outputTransform, "Fixed-to-moving ITK transform")
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

    registration = RegistrationType::New();

    using ParameterObjectType = elastix::ParameterObject;
    const auto        parameterObject = ParameterObjectType::New();
    std::stringstream ss;
    ss << parameterObjectJson.Get().rdbuf();
    const std::string errorMessage = itk::wasm::ReadParameterObject(ss.str(), parameterObject);
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

    // Any ITK transform parameterization is accepted as the external initial transform: a single
    // transform, a transform chain, or a composite transform, from the wasm memory store or a file.
    typename TransformType::Pointer initialTransform;
    if (!initialTransformArg.empty())
    {
      ITK_WASM_CATCH_EXCEPTION(pipeline,
                               initialTransform = readInputTransform<ImageType::ImageDimension>(initialTransformArg));
      registration->SetExternalInitialTransform(initialTransform);
    }
    else if (!initialTransformParameterObjectOption->empty())
    {
      using ParameterObjectType = elastix::ParameterObject;
      const auto        initialTransformParameterObject = ParameterObjectType::New();
      std::stringstream ss;
      ss << initialTransformParameterObjectJson.Get().rdbuf();
      const std::string errorMessage = itk::wasm::ReadParameterObject(ss.str(), initialTransformParameterObject);
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

    // The fixed-to-moving transform is emitted as an itk-wasm TransformList: a composite of the ITK
    // transforms converted from the optimized elastix transforms, or an identity transform when the
    // registration produced no transform.
    if (registration->GetNumberOfTransforms() == 0)
    {
      using IdentityTransformType = itk::IdentityTransform<ParametersValueType, ImageType::ImageDimension>;
      typename IdentityTransformType::Pointer identity = IdentityTransformType::New();
      outputTransform.Set(identity);
    }
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

    std::string       serialized{};
    const std::string writeErrorMessage = itk::wasm::WriteParameterObject(transformParameterObject, serialized);
    if (!writeErrorMessage.empty())
    {
      std::cerr << "Error serializing parameter object: " << writeErrorMessage << std::endl;
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
