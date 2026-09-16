from pathlib import Path
import json

import pytest

from itkwasm_elastix_wasi import read_parameter_files, write_parameter_files

def read_parameters_multiple():
    test_data_input_dir = Path(__file__).parent.parent.parent.parent / 'test' / 'data' / 'input'
    parameters_multiple_file = test_data_input_dir / 'parameters_multiple.json'
    with open(parameters_multiple_file, 'r') as f:
        return json.load(f)

def output_dir():
    test_data_output_dir = Path(__file__).parent.parent.parent.parent / 'test' / 'data' / 'output'
    test_data_output_dir.mkdir(parents=True, exist_ok=True)
    return test_data_output_dir

def test_write_parameter_files():
    parameters_multiple = read_parameters_multiple()
    test_data_output_dir = output_dir()

    translation_file = test_data_output_dir / 'translation.txt'
    affine_file = test_data_output_dir / 'affine.txt'

    write_parameter_files(parameters_multiple, [translation_file, affine_file])

def test_write_toml_parameter_files():
    parameters_multiple = read_parameters_multiple()
    test_data_output_dir = output_dir()

    # The .toml extension selects the TOML parameter file format
    translation_file = test_data_output_dir / 'translation.toml'
    affine_file = test_data_output_dir / 'affine.toml'

    write_parameter_files(parameters_multiple, [translation_file, affine_file])

    translation_toml = translation_file.read_text()
    assert 'Transform = "TranslationTransform"' in translation_toml
    assert 'NumberOfResolutions = 4' in translation_toml
    assert 'UseDirectionCosines = true' in translation_toml
    assert '(Transform' not in translation_toml

    affine_toml = affine_file.read_text()
    assert 'Transform = "AffineTransform"' in affine_toml

    # Round trip
    parameter_object = read_parameter_files([translation_file, affine_file])
    assert parameter_object == parameters_multiple
