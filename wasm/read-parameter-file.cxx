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

#include "rapidjson/document.h"
#include "rapidjson/prettywriter.h"
#include "rapidjson/stringbuffer.h"

int main( int argc, char * argv[] )
{
  itk::wasm::Pipeline pipeline("read-parameter-file", "Read an elastix parameter text file into a parameter object.", argc, argv);

  std::vector<std::string> parameterFiles;
  pipeline.add_option("-f,--parameter-files", parameterFiles, "Elastix parameter files")->required()->type_name("INPUT_TEXT_FILE");

  itk::wasm::OutputTextStream parameterObjectJson;
  pipeline.add_option("parameter-object", parameterObjectJson, "Elastix parameter object representation")->required()->type_name("OUTPUT_JSON");

  ITK_WASM_PARSE(pipeline);

  using ParameterObjectType = elastix::ParameterObject;
  auto parameterObject = ParameterObjectType::New();
  ITK_WASM_CATCH_EXCEPTION(pipeline, parameterObject->ReadParameterFiles(parameterFiles));

  rapidjson::Document document;
  document.SetArray();
  rapidjson::Document::AllocatorType & allocator = document.GetAllocator();

  const auto numParameterMaps = parameterObject->GetNumberOfParameterMaps();
  for (unsigned int i = 0; i < numParameterMaps; ++i)
  {
    const auto & parameterMap = parameterObject->GetParameterMap(i);
    rapidjson::Value parameterMapJson(rapidjson::kObjectType);
    for (const auto & parameter : parameterMap)
    {
      const auto & key = parameter.first;
      const auto & value = parameter.second;
      rapidjson::Value valueJson(rapidjson::kArrayType);
      for (const auto & valueElement : value)
      {
        valueJson.PushBack(rapidjson::Value(valueElement.c_str(), allocator).Move(), allocator);
      }
      parameterMapJson.AddMember(rapidjson::Value(key.c_str(), allocator).Move(), valueJson, allocator);
    }
    document.PushBack(parameterMapJson, allocator);
  }

  rapidjson::StringBuffer buffer;
  rapidjson::PrettyWriter<rapidjson::StringBuffer> writer(buffer);
  document.Accept(writer);

  parameterObjectJson.Get() << buffer.GetString();

  return EXIT_SUCCESS;
}