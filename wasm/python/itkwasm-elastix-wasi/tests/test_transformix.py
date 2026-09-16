from pathlib import Path
import json

import numpy as np
import pytest

from itkwasm import TransformParameterizations
from itkwasm_compare_images import compare_images
from itkwasm_image_io import imread

from itkwasm_elastix_wasi import elastix, transformix

test_input_dir = Path(__file__).parent.parent.parent.parent / 'test' / 'data' / 'input'


def read_head_images():
    return imread(test_input_dir / 'CT_2D_head_fixed.mha'), imread(test_input_dir / 'CT_2D_head_moving.mha')


def read_parameter_object(filename):
    with open(test_input_dir / filename, 'r') as f:
        return json.load(f)


def register():
    fixed, moving = read_head_images()
    parameter_object = read_parameter_object('parameters_single.json')
    registered, transform, transform_parameter_object = elastix(parameter_object, fixed, moving)
    return fixed, moving, registered, transform, transform_parameter_object


def mean_absolute_difference(a, b):
    return float(np.mean(np.abs(a.data.astype(np.float64) - b.data.astype(np.float64))))


def test_transformix_parameter_object():
    fixed, moving, registered, transform, transform_parameter_object = register()

    result = transformix(moving, transform_parameter_object=transform_parameter_object)

    assert result.imageType.dimension == 2
    assert list(result.size) == list(registered.size)
    # transformix reproduces the resampled image elastix produced.
    metrics, diff, diffuchar = compare_images(result, baseline_images=[registered,])
    assert metrics['almostEqual']


def test_transformix_itk_transform():
    fixed, moving, registered, transform, transform_parameter_object = register()
    assert [t.transformType.transformParameterization for t in transform] == [
        TransformParameterizations.Composite,
        TransformParameterizations.Affine,
    ]

    # The elastix output TransformList is applied directly, with the output
    # image domain taken from the fixed image.
    result = transformix(
        moving,
        transform=transform,
        output_origin=list(fixed.origin),
        output_spacing=list(fixed.spacing),
        output_size=list(fixed.size),
        output_direction=list(np.asarray(fixed.direction).ravel()),
    )

    assert list(result.size) == list(fixed.size)
    np.testing.assert_allclose(result.origin, fixed.origin)
    np.testing.assert_allclose(result.spacing, fixed.spacing)
    assert mean_absolute_difference(result, registered) < 1.0

    # With both, the parameter object only supplies the output image domain
    # and the resample interpolator.
    result = transformix(moving, transform=transform, transform_parameter_object=transform_parameter_object)
    assert list(result.size) == list(registered.size)
    assert mean_absolute_difference(result, registered) < 1.0


def test_transformix_default_domain_is_moving_image():
    fixed, moving, registered, transform, transform_parameter_object = register()

    result = transformix(moving, transform=transform)

    assert list(result.size) == list(moving.size)
    np.testing.assert_allclose(result.origin, moving.origin)
    np.testing.assert_allclose(result.spacing, moving.spacing)


def test_transformix_requires_a_transform():
    fixed, moving = read_head_images()

    with pytest.raises(Exception):
        transformix(moving)
