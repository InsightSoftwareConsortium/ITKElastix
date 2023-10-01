# Generated file. Do not edit.

import os
from typing import Dict, Tuple, Optional, List, Any

from itkwasm import (
    environment_dispatch,
)

async def default_parameter_map_async(
    transform_name: str,
    number_of_resolutions: int = 4,
    final_grid_spacing: float = 10,
) -> Any:
    """Returns the default elastix parameter map for a given transform type.

    :param transform_name: Transform name. One of: translation, rigid, affine, bspline, spline, groupwise
    :type  transform_name: str

    :param number_of_resolutions: Number of multiscale registration resolutions.
    :type  number_of_resolutions: int

    :param final_grid_spacing: Final grid spacing in physical units for bspline transforms.
    :type  final_grid_spacing: float

    :return: Elastix parameter map representation
    :rtype:  Any
    """
    func = environment_dispatch("itkwasm_elastix", "default_parameter_map_async")
    output = await func(transform_name, number_of_resolutions=number_of_resolutions, final_grid_spacing=final_grid_spacing)
    return output
