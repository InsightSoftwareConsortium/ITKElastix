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


def test_convert_to_parameter_value():
    assert itk.convert_to_parameter_value("hello") == "hello"
    assert itk.convert_to_parameter_value(True) == "true"
    assert itk.convert_to_parameter_value(False) == "false"
    assert itk.convert_to_parameter_value(42) == "42"
    assert itk.convert_to_parameter_value(3.14) == "3.14"


def test_convert_to_parameter_map():
    toml_dict = {
        "Transform": "TranslationTransform",
        "NumberOfParameters": 2,
        "TransformParameters": [1.5, -3.0],
        "UseDirectionCosines": True,
        "CompressResultImage": False,
    }

    pm = itk.convert_to_parameter_map(toml_dict)

    assert pm["Transform"] == ("TranslationTransform",)
    assert pm["NumberOfParameters"] == ("2",)
    assert pm["TransformParameters"] == ("1.5", "-3.0")
    assert pm["UseDirectionCosines"] == ("true",)
    assert pm["CompressResultImage"] == ("false",)


def test_dict_to_parameter_object_single_dict():
    toml_dict = {
        "Transform": "TranslationTransform",
        "NumberOfParameters": 2,
        "TransformParameters": [1.5, -3.0],
        "UseDirectionCosines": True,
        "CompressResultImage": False,
    }

    parameter_object = itk.dict_to_parameter_object(toml_dict)
    assert parameter_object.GetNumberOfParameterMaps() == 1
    result_map = parameter_object.GetParameterMap(0)
    assert result_map["Transform"] == ("TranslationTransform",)


def test_dict_to_parameter_object_list_of_dicts():
    dicts = [
        {"Transform": "TranslationTransform", "NumberOfParameters": 2},
        {"Transform": "AffineTransform", "NumberOfParameters": 12},
    ]

    parameter_object = itk.dict_to_parameter_object(dicts)
    assert parameter_object.GetNumberOfParameterMaps() == 2
    map0 = parameter_object.GetParameterMap(0)
    map1 = parameter_object.GetParameterMap(1)
    assert map0["Transform"] == ("TranslationTransform",)
    assert map1["Transform"] == ("AffineTransform",)


def test_parameter_object_new_with_converted_map():
    toml_dict = {
        "Transform": "TranslationTransform",
        "NumberOfParameters": 2,
    }

    parameter_object = itk.ParameterObject.New(
        parameter_map=itk.convert_to_parameter_map(toml_dict)
    )
    assert parameter_object.GetNumberOfParameterMaps() == 1


def test_convert_to_parameter_map_idempotent():
    already_correct = {
        "Transform": ("TranslationTransform",),
        "NumberOfParameters": ("2",),
    }

    pm = itk.convert_to_parameter_map(already_correct)
    assert pm["Transform"] == ("TranslationTransform",)
    assert pm["NumberOfParameters"] == ("2",)


if __name__ == "__main__":
    test_convert_to_parameter_value()
    test_convert_to_parameter_map()
    test_dict_to_parameter_object_single_dict()
    test_dict_to_parameter_object_list_of_dicts()
    test_parameter_object_new_with_converted_map()
    test_convert_to_parameter_map_idempotent()
    print("All dict parameter map conversion tests passed.")
