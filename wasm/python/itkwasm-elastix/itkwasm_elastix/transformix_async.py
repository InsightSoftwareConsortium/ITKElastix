# Generated file. Do not edit.

import os
from typing import Dict, Tuple, Optional, List, Any

from itkwasm import (
    environment_dispatch,
    Image,
)

async def transformix_async(
    moving: Image,
    transform_parameter_object: Any,
    output_origin: Optional[List[float]] = None,
    output_spacing: Optional[List[float]] = None,
    output_size: Optional[List[int]] = None,
    output_direction: Optional[List[float]] = None,
) -> Image:
    """Apply an elastix transform parameter object to an image.

    :param moving: Moving image
    :type  moving: Image

    :param transform_parameter_object: Elastix transform parameter object to apply. Only provide this or an initial transform.
    :type  transform_parameter_object: Any

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
    output = await func(moving, transform_parameter_object, output_origin=output_origin, output_spacing=output_spacing, output_size=output_size, output_direction=output_direction)
    return output
