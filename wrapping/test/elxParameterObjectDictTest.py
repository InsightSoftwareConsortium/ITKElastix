# ==========================================================================
#
#   Copyright NumFOCUS
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#          https://www.apache.org/licenses/LICENSE-2.0.txt
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.
#
# ==========================================================================*/

import itk
import sys

# ---------- _convert_to_parameter_value ----------

assert itk._convert_to_parameter_value("hello") == "hello"
assert itk._convert_to_parameter_value(True) == "true"
assert itk._convert_to_parameter_value(False) == "false"
assert itk._convert_to_parameter_value(42) == "42"
assert itk._convert_to_parameter_value(3.14) == "3.14"

# ---------- _convert_to_parameter_map ----------

toml_dict = {
    "Transform": "TranslationTransform",
    "NumberOfParameters": 2,
    "TransformParameters": [1.5, -3.0],
    "UseDirectionCosines": True,
    "CompressResultImage": False,
}

pm = itk._convert_to_parameter_map(toml_dict)

assert pm["Transform"] == ("TranslationTransform",)
assert pm["NumberOfParameters"] == ("2",)
assert pm["TransformParameters"] == ("1.5", "-3.0")
assert pm["UseDirectionCosines"] == ("true",)
assert pm["CompressResultImage"] == ("false",)

# ---------- ParameterObject from dict ----------

parameter_object = itk._dict_to_parameter_object(toml_dict)
assert parameter_object.GetNumberOfParameterMaps() == 1
result_map = parameter_object.GetParameterMap(0)
assert result_map["Transform"] == ("TranslationTransform",)

# ---------- ParameterObject from list of dicts ----------

dicts = [
    {"Transform": "TranslationTransform", "NumberOfParameters": 2},
    {"Transform": "AffineTransform", "NumberOfParameters": 12},
]

parameter_object = itk._dict_to_parameter_object(dicts)
assert parameter_object.GetNumberOfParameterMaps() == 2
map0 = parameter_object.GetParameterMap(0)
map1 = parameter_object.GetParameterMap(1)
assert map0["Transform"] == ("TranslationTransform",)
assert map1["Transform"] == ("AffineTransform",)

# ---------- ParameterObject.New(parameter_map=dict) ----------

parameter_object = itk.ParameterObject.New(
    parameter_map=itk._convert_to_parameter_map(toml_dict)
)
assert parameter_object.GetNumberOfParameterMaps() == 1

# ---------- Idempotent conversion ----------

already_correct = {
    "Transform": ("TranslationTransform",),
    "NumberOfParameters": ("2",),
}

pm2 = itk._convert_to_parameter_map(already_correct)
assert pm2["Transform"] == ("TranslationTransform",)
assert pm2["NumberOfParameters"] == ("2",)

print("All dict parameter map conversion tests passed.")
