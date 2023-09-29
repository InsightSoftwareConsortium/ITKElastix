from pathlib import Path
import json

import pytest

from itkwasm_elastix_wasi import write_parameter_files

def test_write_parameter_files():
    test_data_input_dir = Path(__file__).parent.parent.parent.parent / 'test' / 'data' / 'input'
    test_data_output_dir = Path(__file__).parent.parent.parent.parent / 'test' / 'data' / 'output'
    test_data_output_dir.mkdir(parents=True, exist_ok=True)

    parameters_multiple_file = test_data_input_dir / 'parameters_multiple.json'
    with open(parameters_multiple_file, 'r') as f:
        parameters_multiple = json.load(f)

    translation_file = test_data_output_dir / 'translation.txt'
    affine_file = test_data_output_dir / 'affine.txt'

    write_parameter_files(parameters_multiple, [translation_file, affine_file])