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
#include "itkInputTextStream.h"

#include <sstream>

#include "itkElastixWasmParameterObject.h"

#include "glaze/glaze.hpp"

#include "itkNumberToString.h"

int
main(int argc, char * argv[])
{
  itk::wasm::Pipeline pipeline(
    "write-parameter-files", "Write an elastix parameter text file from a parameter object.", argc, argv);

  itk::wasm::InputTextStream parameterObjectJson;
  pipeline.add_option("parameter-object", parameterObjectJson, "Elastix parameter object representation.")
    ->required()
    ->type_name("INPUT_JSON");

  std::vector<std::string> parameterFiles;
  pipeline
    .add_option("parameter-files",
                parameterFiles,
                "Elastix parameter files, must have the same length as the "
                "number of parameter maps in the parameter object.")
    ->required()
    ->type_name("OUTPUT_TEXT_FILE");

  ITK_WASM_PARSE(pipeline);

  std::stringstream   ss;
  ss << parameterObjectJson.Get().rdbuf();
  itk::wasm::ParameterMapVector wasmParameterMaps;
  auto errorCode = glz::read_json<itk::wasm::ParameterMapVector>(wasmParameterMaps, ss.str());
  if (errorCode)
  {
    const std::string errorMessage = glz::format_error(errorCode, ss.str());
    std::cerr << "Error reading parameter object JSON: " << errorMessage << std::endl;
    return EXIT_FAILURE;
  }

  using ParameterObjectType = elastix::ParameterObject;
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
          parameterValues.push_back(itk::ConvertNumberToString(valueInt));
        }
        else if (value.index() == 3)
        {
          const auto & valueDouble = std::get<double>(value);
          parameterValues.push_back(itk::ConvertNumberToString(valueDouble));
        }
      }
      parameterMap[parameter.first] = parameterValues;
    }

    parameterMaps.push_back(parameterMap);
  }

  ITK_WASM_CATCH_EXCEPTION(pipeline, elastix::ParameterObject::WriteParameterFiles(parameterMaps, parameterFiles));

  return EXIT_SUCCESS;
}
