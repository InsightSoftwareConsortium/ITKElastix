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
#include "elxParameterObject.h"
#include "itkPipeline.h"
#include "itkOutputTextStream.h"
#include "Install/elxConversion.h"

int
main(int argc, char * argv[])
{
  itk::wasm::Pipeline pipeline(
    "default-parameter-map", "Returns the default elastix parameter map for a given transform type.", argc, argv);

  std::string transformName;
  pipeline
    .add_option(
      "transform-name", transformName, "Transform name. One of: translation, rigid, affine, bspline, spline, groupwise")
    ->required();

  unsigned int numberOfResolutions = 4;
  pipeline.add_option(
    "-r,--number-of-resolutions", numberOfResolutions, "Number of multiscale registration resolutions.");

  double finalGridSpacingInPhysicalUnits = 10.0;
  pipeline.add_option("-g,--final-grid-spacing",
                      finalGridSpacingInPhysicalUnits,
                      "Final grid spacing in physical units for bspline transforms.");

  itk::wasm::OutputTextStream outputTextStream;
  pipeline.add_option("parameter-map", outputTextStream, "Elastix parameter map representation")
    ->required()
    ->type_name("OUTPUT_TEXT_STREAM");

  ITK_WASM_PARSE(pipeline);

  using ParameterObjectType = elastix::ParameterObject;
  auto parameterMap =
    ParameterObjectType::GetDefaultParameterMap(transformName, numberOfResolutions, finalGridSpacingInPhysicalUnits);

  outputTextStream.Get() << elastix::Conversion::ParameterMapToString(parameterMap,
                                                                      elastix::ParameterMapStringFormat::Toml);
  return EXIT_SUCCESS;
}