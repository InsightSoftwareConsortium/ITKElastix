# Generated file. Do not edit.

import os
from typing import Dict, Tuple, Optional, List, Any

from itkwasm import (
    environment_dispatch,
    Image,
    TransformList,
)

async def transformix_async(
    moving: Image,
    transform_parameter_object: Optional[Any] = None,
    transform: Optional[TransformList] = None,
    output_origin: Optional[List[float]] = None,
    output_spacing: Optional[List[float]] = None,
    output_size: Optional[List[int]] = None,
    output_direction: Optional[List[float]] = None,
) -> Image:
    """Apply an elastix transform parameter object or an ITK transform to an image.

    :param moving: Moving image
    :type  moving: Image

    :param transform_parameter_object: Elastix transform parameter object to apply. Provide this and/or an ITK transform. When both are provided, only its output image domain and resample interpolator are used.
    :type  transform_parameter_object: Any

    :param transform: ITK transform to apply. Provide this and/or a transform parameter object. The output image domain defaults to the moving image domain.
    :type  transform: TransformList

    :param output_origin: Output image origin.
    :type  output_origin: float

    :param output_spacing: Output image spacing.
    :type  output_spacing: float

    :param output_size: Output image size.
    :type  output_size: int

    :param output_direction: Output image orientation direction matrix.
    :type  output_direction: float

    :return: Resampled moving image
    :rtype:  Image
    """
    func = environment_dispatch("itkwasm_elastix", "transformix_async")
    output = await func(moving, transform_parameter_object=transform_parameter_object, transform=transform, output_origin=output_origin, output_spacing=output_spacing, output_size=output_size, output_direction=output_direction)
    return output
