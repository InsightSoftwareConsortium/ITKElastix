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

#include "itkElastixWasmParameterObject.h"

#include "glaze/glaze.hpp"

int
main(int argc, char * argv[])
{
  itk::wasm::Pipeline pipeline(
    "read-parameter-files", "Read elastix parameter text files into a parameter object.", argc, argv);

  std::vector<std::string> parameterFiles;
  pipeline.add_option("-f,--parameter-files", parameterFiles, "Elastix parameter files")
    ->required()
    ->type_name("INPUT_TEXT_FILE");

  itk::wasm::OutputTextStream parameterObjectJson;
  pipeline.add_option("parameter-object", parameterObjectJson, "Elastix parameter object representation")
    ->required()
    ->type_name("OUTPUT_JSON");

  ITK_WASM_PARSE(pipeline);

  using ParameterObjectType = elastix::ParameterObject;
  auto parameterObject = ParameterObjectType::New();
  ITK_WASM_CATCH_EXCEPTION(pipeline, parameterObject->ReadParameterFiles(parameterFiles));

  itk::wasm::ParameterMapVector parameterMaps;

  const auto numParameterMaps = parameterObject->GetNumberOfParameterMaps();
  for (unsigned int i = 0; i < numParameterMaps; ++i)
  {
    const auto &            parameterMap = parameterObject->GetParameterMap(i);
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
    parameterMaps.push_back(wasmParameterMap);
  }

  std::string serialized{};
  auto        errorCode = glz::write<glz::opts{ .prettify = true }>(parameterMaps, serialized);
  if (errorCode)
  {
    const std::string errorMessage = glz::format_error(errorCode, serialized);
    std::cerr << "Error serializing parameter object: " << errorMessage << std::endl;
    return EXIT_FAILURE;
  }

  parameterObjectJson.Get() << serialized;

  return EXIT_SUCCESS;
}