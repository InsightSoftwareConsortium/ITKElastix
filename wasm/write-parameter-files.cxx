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

#include "rapidjson/document.h"
#include "rapidjson/prettywriter.h"
#include "rapidjson/stringbuffer.h"

#include <sstream>

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

  rapidjson::Document document;
  std::stringstream   ss;
  ss << parameterObjectJson.Get().rdbuf();
  document.Parse(ss.str().c_str());

  using ParameterObjectType = elastix::ParameterObject;
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
    parameterMaps.push_back(parameterMap);
  }

  // The initial is not written by WriteParameterFiles
  ITK_WASM_CATCH_EXCEPTION(pipeline, elastix::ParameterObject::WriteParameterFile(parameterMaps[0], parameterFiles[0]));
  ITK_WASM_CATCH_EXCEPTION(pipeline, elastix::ParameterObject::WriteParameterFiles(parameterMaps, parameterFiles));

  return EXIT_SUCCESS;
}
