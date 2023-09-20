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
#include "itkSupportInputImageTypes.h"

#include "itkImage.h"
#include "itkTransformFileWriter.h"
#include "itkIdentityTransform.h"

template <typename TImage>
class PipelineFunctor
{
public:
  int
  operator()(itk::wasm::Pipeline & pipeline)
  {
    using ImageType = TImage;

    using InputImageType = itk::wasm::InputImage<ImageType>;
    InputImageType fixedImage;
    pipeline.add_option("-f,--fixed", fixedImage, "Fixed image")->type_name("INPUT_IMAGE");

    InputImageType movingImage;
    pipeline.add_option("-m,--moving", movingImage, "Moving image")->type_name("INPUT_IMAGE");

    using OutputImageType = itk::wasm::OutputImage<ImageType>;
    OutputImageType resultImage;
    pipeline.add_option("result", resultImage, "Resampled moving image")->required()->type_name("OUTPUT_IMAGE");

    std::string outputTransform;
    pipeline.add_option("transform", outputTransform, "Fixed-to-moving transform")
      ->required()
      ->type_name("OUTPUT_BINARY_FILE");

    ITK_WASM_PARSE(pipeline);

    using RegistrationType = itk::ElastixRegistrationMethod<ImageType, ImageType>;
    typename RegistrationType::Pointer registration = RegistrationType::New();

    auto fixed = const_cast<ImageType *>(fixedImage.Get());
    auto moving = const_cast<ImageType *>(movingImage.Get());
    registration->SetFixedImage(fixed);
    registration->SetMovingImage(moving);

    ITK_WASM_CATCH_EXCEPTION(pipeline, registration->Update());

    typename ImageType::Pointer outputImage = registration->GetOutput();
    resultImage.Set(outputImage);

    const auto writer = itk::TransformFileWriter::New();

    if (registration->GetNumberOfTransforms() == 0)
    {
      using IdentityTransformType = itk::IdentityTransform<double, ImageType::ImageDimension>;
      typename IdentityTransformType::ConstPointer identity = IdentityTransformType::New();
      writer->SetInput(identity);
      writer->SetFileName(outputTransform);
      ITK_WASM_CATCH_EXCEPTION(pipeline, writer->Update());
    }
    else
    {
      typename RegistrationType::TransformType::ConstPointer combinationTransform =
        registration->GetCombinationTransform();
      combinationTransform->Print(std::cout);
      typename RegistrationType::TransformType::ConstPointer compositeTransform =
        registration->ConvertToItkTransform(*combinationTransform);
      writer->SetInput(compositeTransform);
      writer->SetFileName(outputTransform);
      ITK_WASM_CATCH_EXCEPTION(pipeline, writer->Update());
    }

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
