from pathlib import Path
from dataclasses import asdict

import pytest

from itkwasm_compare_images import compare_images
from itkwasm import Image
import itk

from itkwasm_elastix_wasi import elastix

def test_elastix_wasm():

    fixed_filename = 'CT_2D_head_fixed.mha'
    fixed_filepath = Path(__file__).parent.parent.parent.parent / 'test' / 'data' / 'input' / fixed_filename
    fixed_image = itk.imread(fixed_filepath)

    fixed_image_dict = itk.dict_from_image(fixed_image)
    fixed_image = Image(**fixed_image_dict)

    moving_filename = 'CT_2D_head_moving.mha'
    moving_filepath = Path(__file__).parent.parent.parent.parent / 'test' / 'data' / 'input' / moving_filename
    moving_image = itk.imread(moving_filepath)

    moving_image_dict = itk.dict_from_image(moving_image)
    moving_image = Image(**moving_image_dict)

    result_image = elastix(fixed_image, moving_image)

    output_dir = Path(__file__).parent.parent.parent.parent  / 'test' / 'data' / 'output'
    output_dir.mkdir(parents=True, exist_ok=True)
    output_filename = output_dir / fixed_filename.replace('fixed.mha', 'result.mha')

    result = itk.image_from_dict(asdict(result_image))
    itk.imwrite(result, output_filename)

    expected_filename = Path(__file__).parent.parent.parent.parent / 'test' / 'data' / 'baseline' / fixed_filename.replace('fixed.mha', 'result.mha')
    expected = itk.imread(expected_filename)
    expected_dict = itk.dict_from_image(expected)
    expected = Image(**expected_dict)
    result_dict = itk.dict_from_image(result)
    result = Image(**result_dict)

    metrics, diff, diffuchar = compare_images(result, baseline_images=[expected,])
    assert metrics['almostEqual']