from pathlib import Path
import json

import numpy as np
import pytest

from itkwasm import (
    FloatTypes,
    Transform,
    TransformList,
    TransformParameterizations,
    TransformType,
)
from itkwasm_compare_images import compare_images
from itkwasm_image_io import imread, imwrite

from itkwasm_elastix_wasi import elastix

test_data_dir = Path(__file__).parent.parent.parent.parent / 'test' / 'data'
test_input_dir = test_data_dir / 'input'
test_baseline_dir = test_data_dir / 'baseline'
test_output_dir = test_data_dir / 'output'
test_output_dir.mkdir(parents=True, exist_ok=True)

fixed_filename = 'CT_2D_head_fixed.mha'
moving_filename = 'CT_2D_head_moving.mha'


def read_parameter_object(filename):
    with open(test_input_dir / filename, 'r') as f:
        return json.load(f)


def read_head_images():
    return imread(test_input_dir / fixed_filename), imread(test_input_dir / moving_filename)


def parameterizations(transform: TransformList):
    return [t.transformType.transformParameterization for t in transform]


def test_elastix_wasm():
    parameter_object = read_parameter_object('parameters_single.json')
    fixed_image, moving_image = read_head_images()

    result_image, transform, transform_parameter_object = elastix(parameter_object, fixed_image, moving_image)

    # The fixed-to-moving transform is an itkwasm TransformList: a composite
    # marker followed by the ITK transforms converted from the optimized
    # elastix transforms.
    assert isinstance(transform, list)
    assert parameterizations(transform) == [TransformParameterizations.Composite, TransformParameterizations.Affine]
    affine = transform[1]
    assert affine.transformType.parametersValueType == FloatTypes.Float64
    assert affine.transformType.inputDimension == 2
    assert affine.transformType.outputDimension == 2
    assert affine.numberOfParameters == 6
    assert len(affine.parameters) == 6
    assert affine.numberOfFixedParameters == 2
    assert len(affine.fixedParameters) == 2
    # The optimized affine should be close to the identity for this data.
    assert abs(affine.parameters[0] - 1.0) < 0.2
    assert abs(affine.parameters[3] - 1.0) < 0.2

    assert len(transform_parameter_object) == 1
    assert transform_parameter_object[0]['Transform'] == ['AffineTransform']

    output_filename = test_output_dir / fixed_filename.replace('fixed.mha', 'result.mha')
    imwrite(result_image, output_filename)

    expected = imread(test_baseline_dir / fixed_filename.replace('fixed.mha', 'result.mha'))
    metrics, diff, diffuchar = compare_images(result_image, baseline_images=[expected,])
    assert metrics['almostEqual']


def test_elastix_wasm_multiple_parameter_maps():
    parameter_object = read_parameter_object('parameters_multiple.json')
    fixed_image, moving_image = read_head_images()

    result_image, transform, transform_parameter_object = elastix(parameter_object, fixed_image, moving_image)

    assert result_image.imageType.dimension == 2
    assert len(transform_parameter_object) == 2

    kinds = parameterizations(transform)
    assert len(kinds) == 3
    assert kinds[0] == TransformParameterizations.Composite
    assert TransformParameterizations.Translation in kinds
    assert TransformParameterizations.Affine in kinds
    translation = transform[kinds.index(TransformParameterizations.Translation)]
    assert translation.numberOfParameters == 2
    assert len(translation.parameters) == 2


def test_elastix_wasm_initial_transform():
    parameter_object = read_parameter_object('parameters_single.json')
    fixed_image, moving_image = read_head_images()

    # A single, non-composite ITK transform as the initial transform.
    translation = Transform(
        transformType=TransformType(TransformParameterizations.Translation, FloatTypes.Float64, 2, 2),
        numberOfFixedParameters=0,
        numberOfParameters=2,
        fixedParameters=np.array([], dtype=np.float64),
        parameters=np.array([2.0, -3.0], dtype=np.float64),
    )

    result_image, transform, transform_parameter_object = elastix(
        parameter_object, fixed_image, moving_image, initial_transform=[translation]
    )

    assert result_image.imageType.dimension == 2
    assert result_image.size[0] == 256

    # The output composite lists the optimized affine first and the initial
    # transform last. itk.CompositeTransform applies its queue in reverse, so
    # the initial translation is applied to a point before the affine.
    assert parameterizations(transform) == [
        TransformParameterizations.Composite,
        TransformParameterizations.Affine,
        TransformParameterizations.Translation,
    ]
    np.testing.assert_allclose(transform[2].parameters, [2.0, -3.0])

    # The composite output transform can itself be the initial transform of
    # another registration; it is flattened into the new output composite
    # behind the newly optimized affine.
    result_image, transform2, _ = elastix(
        parameter_object, fixed_image, moving_image, initial_transform=transform
    )
    assert result_image.imageType.dimension == 2
    assert parameterizations(transform2) == [
        TransformParameterizations.Composite,
        TransformParameterizations.Affine,
        TransformParameterizations.Affine,
        TransformParameterizations.Translation,
    ]
    np.testing.assert_allclose(transform2[3].parameters, [2.0, -3.0])
