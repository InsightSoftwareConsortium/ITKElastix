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

 } // namespace wasm
 } // namespace itk

 #endif // itkElastixWasmParameterObject_h