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
#include "itkTransformixFilter.h"
#include "itkPipeline.h"
#include "itkInputImage.h"
#include "itkOutputImage.h"
#include "itkInputTextStream.h"
#include "itkOutputTextStream.h"
#include "itkSupportInputImageTypes.h"

#include "itkImage.h"
#include "itkIdentityTransform.h"
#include "itkCompositeTransform.h"
#include "itkCompositeTransformIOHelper.h"
#include "itkNumberToString.h"

#include <sstream>

#include "itkElastixWasmParameterObject.h"

// Workaround function to check if a parameter exists in the parameter object
// since elx::ParameterObject doesn't have a HasParameter method, yet, added in
// https://github.com/SuperElastix/elastix/pull/1338
bool
HasParameterWorkaround(const elastix::ParameterObject * parameterObject, const std::string & key)
{
  if (!parameterObject || parameterObject->GetNumberOfParameterMaps() == 0)
  {
    return false;
  }

  // Check if the key exists in any of the parameter maps
  for (unsigned int i = 0; i < parameterObject->GetNumberOfParameterMaps(); ++i)
  {
    const auto & parameterMap = parameterObject->GetParameterMap(i);
    if (parameterMap.find(key) != parameterMap.end())
    {
      return true;
    }
  }
  return false;
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
    constexpr unsigned int ImageDimension = ImageType::ImageDimension;

    using InputImageType = itk::wasm::InputImage<ImageType>;
    InputImageType movingImage;
    pipeline.add_option("moving", movingImage, "Moving image")->required()->type_name("INPUT_IMAGE");

    itk::wasm::InputTextStream transformParameterObjectJson;
    auto                       transformParameterObjectOption =
      pipeline
        .add_option("transform-parameter-object",
                    transformParameterObjectJson,
                    "Elastix transform parameter object to apply. Only provide this or an "
                    "initial transform.")
        ->required()
        ->type_name("INPUT_JSON");

    std::vector<double> outputOrigin(ImageDimension, 0.0);
    auto outputOriginOption = pipeline.add_option("-o,--output-origin", outputOrigin, "Output image origin.");
    std::vector<double> outputSpacing(ImageDimension, 1.0);
    auto outputSpacingOption = pipeline.add_option("-s,--output-spacing", outputSpacing, "Output image spacing.");
    std::vector<uint64_t> outputSize(ImageDimension, 0);
    auto                  outputSizeOption = pipeline.add_option("-z,--output-size", outputSize, "Output image size.");
    std::vector<double>   outputDirection;
    auto                  outputDirectionOption =
      pipeline.add_option("-d,--output-direction", outputDirection, "Output image orientation direction matrix.");

    using OutputImageType = itk::wasm::OutputImage<ImageType>;
    OutputImageType resultImage;
    pipeline.add_option("result", resultImage, "Resampled moving image")->required()->type_name("OUTPUT_IMAGE");

    ITK_WASM_PARSE(pipeline);

    using TransformixType = itk::TransformixFilter<ImageType>;
    typename TransformixType::Pointer transformix = TransformixType::New();

    using ParameterObjectType = elastix::ParameterObject;
    const auto        transformParameterObject = ParameterObjectType::New();
    std::stringstream ss;
    ss << transformParameterObjectJson.Get().rdbuf();
    const std::string errorMessage = itk::wasm::ReadParameterObject(ss.str(), transformParameterObject);
    if (!errorMessage.empty())
    {
      std::cerr << "Error reading transform parameter object JSON: " << errorMessage << std::endl;
      return EXIT_FAILURE;
    }

    transformix->SetMovingImage(const_cast<ImageType *>(movingImage.Get()));

    if (outputOriginOption->count() != 0 || !HasParameterWorkaround(transformParameterObject.GetPointer(), "Origin"))
    {
      if (outputOrigin.size() != ImageDimension)
      {
        std::cerr << "Error: Output origin size does not match image dimension." << std::endl;
        return EXIT_FAILURE;
      }
      std::vector<std::string> outputOriginStr(outputOrigin.size());
      for (size_t i = 0; i < outputOrigin.size(); ++i)
      {
        outputOriginStr[i] = itk::ConvertNumberToString(outputOrigin[i]);
      }
      transformParameterObject->SetParameter("Origin", outputOriginStr);
    }

    if (outputSpacingOption->count() != 0 || !HasParameterWorkaround(transformParameterObject.GetPointer(), "Spacing"))
    {
      if (outputSpacing.size() != ImageDimension)
      {
        std::cerr << "Error: Output spacing size does not match image dimension." << std::endl;
        return EXIT_FAILURE;
      }
      std::vector<std::string> outputSpacingStr(outputSpacing.size());
      for (size_t i = 0; i < outputSpacing.size(); ++i)
      {
        outputSpacingStr[i] = itk::ConvertNumberToString(outputSpacing[i]);
      }
      transformParameterObject->SetParameter("Spacing", outputSpacingStr);
    }

    if (outputSizeOption->count() != 0 || !HasParameterWorkaround(transformParameterObject.GetPointer(), "Size"))
    {
      if (outputSize.size() != ImageDimension)
      {
        std::cerr << "Error: Output size does not match image dimension." << std::endl;
        return EXIT_FAILURE;
      }
      for (unsigned int i = 0; i < ImageDimension; ++i)
      {
        if (outputSize[i] == 0)
        {
          outputSize[i] = movingImage.Get()->GetLargestPossibleRegion().GetSize()[i];
        }
      }
      std::vector<std::string> outputSizeStr(outputSize.size());
      for (size_t i = 0; i < outputSize.size(); ++i)
      {
        outputSizeStr[i] = itk::ConvertNumberToString(outputSize[i]);
      }
      transformParameterObject->SetParameter("Size", outputSizeStr);
    }

    if (outputDirectionOption->count() != 0 ||
        !HasParameterWorkaround(transformParameterObject.GetPointer(), "Direction"))
    {
      if (!outputDirection.empty())
      {
        std::vector<std::string> outputDirectionStr(outputDirection.size());
        for (size_t i = 0; i < outputDirection.size(); ++i)
        {
          outputDirectionStr[i] = itk::ConvertNumberToString(outputDirection[i]);
        }
        transformParameterObject->SetParameter("Direction", outputDirectionStr);
      }
      else
      {
        // If no output direction is provided, use the moving image's direction
        const auto &             movingDirection = movingImage.Get()->GetDirection();
        std::vector<std::string> outputDirectionStr;
        for (unsigned int i = 0; i < ImageDimension; ++i)
        {
          for (unsigned int j = 0; j < ImageDimension; ++j)
          {
            outputDirectionStr.push_back(itk::ConvertNumberToString(movingDirection[i][j]));
          }
        }
        transformParameterObject->SetParameter("Direction", outputDirectionStr);
      }
    }

    std::vector<int64_t> outputIndex(ImageDimension, 0);
    if (!HasParameterWorkaround(transformParameterObject.GetPointer(), "Index"))
    {
      std::vector<std::string> outputIndexStr(outputIndex.size());
      for (size_t i = 0; i < outputIndex.size(); ++i)
      {
        outputIndexStr[i] = itk::ConvertNumberToString(outputIndex[i]);
      }
      transformParameterObject->SetParameter("Index", outputIndexStr);
    }

    transformix->SetTransformParameterObject(transformParameterObject);
    transformix->LogToConsoleOff();

    ITK_WASM_CATCH_EXCEPTION(pipeline, transformix->UpdateLargestPossibleRegion());

    typename ImageType::Pointer outputImage = transformix->GetOutput();
    resultImage.Set(outputImage);

    return EXIT_SUCCESS;
  }
};

int
main(int argc, char * argv[])
{
  itk::wasm::Pipeline pipeline("transformix", "Apply an elastix transform parameter object to an image.", argc, argv);

  return itk::wasm::SupportInputImageTypes<PipelineFunctor, uint8_t, uint16_t, int16_t, double, float>::
    Dimensions<2U, 3U, 4U>("moving", pipeline);
}
