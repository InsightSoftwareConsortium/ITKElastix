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
#ifndef itkElastixWasmParameterObject_h
#define itkElastixWasmParameterObject_h

#include <map>
#include <string>
#include <variant>
#include <vector>

#include "glaze/glaze.hpp"

#include "elxParameterObject.h"

#include "itkNumberToString.h"
namespace itk
{
namespace wasm
{

/**
 * @brief Type used to represent an elastix ParameterKey in ITK-Wasm pipelines
 * and for serializing elastix parameter files with glaze.
 *
 * This is the name of the parameter, e.g. "NumberOfResolutions"
 */
using ParameterKey = std::string;

/**
 * @brief Type used to represent an elastix ParameterValue in ITK-Wasm pipelines
 * and for serializing elastix parameter files with glaze.
 *
 * This is the type cast string held in a ParameterFile
 */
using ParameterValue = std::variant<std::string, bool, int64_t, double>;

using ParameterValueVector = std::vector<ParameterValue>;

/**
 * @brief Type used to represent an elastix ParameterObject in ITK-Wasm pipelines
 * and for serializing elastix parameter files with glaze.
 */
using ParameterMap = std::map<ParameterKey, ParameterValueVector>;

/**
 * @brief Type used to represent a vector of elastix ParameterMaps in ITK-Wasm pipelines
 * and for serializing elastix parameter files with glaze.
 */
using ParameterMapVector = std::vector<ParameterMap>;

/**
 * @brief Read an itk::wasm::ParameterMapVector elastix parameter object JSON representation into an
 * elastix::ParameterObject.
 *
 * @param parameterObjectJson JSON representation of the elastix parameter object
 * @param parameterObject Pointer to the elastix::ParameterObject to populate
 * @return std::string Error message if reading the parameter object fails, empty string otherwise.
 */
std::string
ReadParameterObject(const std::string & parameterObjectJson, elastix::ParameterObject * parameterObject)
{
  using ParameterObjectType = elastix::ParameterObject;

  itk::wasm::ParameterMapVector wasmParameterMaps;
  auto errorCode = glz::read_json<itk::wasm::ParameterMapVector>(wasmParameterMaps, parameterObjectJson);
  if (errorCode)
  {
    const std::string errorMessage = glz::format_error(errorCode, parameterObjectJson);
    return errorMessage;
  }

  const auto                                  numParameterMaps = wasmParameterMaps.size();
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

    parameterObject->AddParameterMap(parameterMap);
  }

  return {};
}

/**
 * @brief Write an elastix::ParameterObject into an itk::wasm::ParameterMapVector JSON representation.
 *
 * @param parameterObject Pointer to the elastix::ParameterObject to serialize
 * @param parameterObjectJson JSON representation of the elastix parameter object (output)
 * @return std::string Error message if writing the parameter object fails, empty string otherwise.
 */
std::string
WriteParameterObject(const elastix::ParameterObject * parameterObject, std::string & parameterObjectJson)
{
  using ParameterObjectType = elastix::ParameterObject;

  itk::wasm::ParameterMapVector wasmParameterMaps;

  const auto numParameterMaps = parameterObject->GetNumberOfParameterMaps();
  wasmParameterMaps.reserve(numParameterMaps);

  for (unsigned int i = 0; i < numParameterMaps; ++i)
  {
    const auto &            parameterMap = parameterObject->GetParameterMap(i);
    itk::wasm::ParameterMap wasmParameterMap;

    for (const auto & parameter : parameterMap)
    {
      const auto & parameterValueVector = parameter.second;
      auto &       wasmValues = wasmParameterMap[parameter.first];
      wasmValues.reserve(parameterValueVector.size());

      // Convert each string into the variant
      for (const auto & val : parameterValueVector)
      {
        wasmValues.emplace_back(val);
      }
    }
    wasmParameterMaps.push_back(wasmParameterMap);
  }

  auto errorCode = glz::write<glz::opts{ .prettify = true }>(wasmParameterMaps, parameterObjectJson);
  if (errorCode)
  {
    const std::string errorMessage = glz::format_error(errorCode, parameterObjectJson);
    return errorMessage;
  }

  return {};
}


} // namespace wasm
} // namespace itk

#endif // itkElastixWasmParameterObject_h