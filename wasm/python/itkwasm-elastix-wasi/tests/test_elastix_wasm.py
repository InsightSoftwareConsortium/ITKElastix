from pathlib import Path
from dataclasses import asdict
import json

import pytest

from itkwasm_compare_images import compare_images
from itkwasm_image_io import imread, imwrite

from itkwasm_elastix_wasi import elastix

def test_elastix_wasm():
    parameter_object_filename = 'parameters_single.json'
    parameter_object_filepath = Path(__file__).parent.parent.parent.parent / 'test' / 'data' / 'input' / parameter_object_filename
    with open(parameter_object_filepath, 'r') as f:
        parameter_object = json.load(f)

    test_data_output_dir = Path(__file__).parent.parent.parent.parent / 'test' / 'data' / 'output'
    test_data_output_dir.mkdir(parents=True, exist_ok=True)
    transform = test_data_output_dir / 'transform.txt'

    fixed_filename = 'CT_2D_head_fixed.mha'
    fixed_filepath = Path(__file__).parent.parent.parent.parent / 'test' / 'data' / 'input' / fixed_filename
    fixed_image = imread(fixed_filepath)

    moving_filename = 'CT_2D_head_moving.mha'
    moving_filepath = Path(__file__).parent.parent.parent.parent / 'test' / 'data' / 'input' / moving_filename
    moving_image = imread(moving_filepath)

    result_image, transform_parameter_object = elastix(parameter_object, transform, fixed_image, moving_image)

    output_dir = Path(__file__).parent.parent.parent.parent  / 'test' / 'data' / 'output'
    output_dir.mkdir(parents=True, exist_ok=True)
    output_filename = output_dir / fixed_filename.replace('fixed.mha', 'result.mha')

    imwrite(result_image, output_filename)

    expected_filename = Path(__file__).parent.parent.parent.parent / 'test' / 'data' / 'baseline' / fixed_filename.replace('fixed.mha', 'result.mha')
    expected = imread(expected_filename)

    metrics, diff, diffuchar = compare_images(result_image, baseline_images=[expected,])
    assert metrics['almostEqual']
