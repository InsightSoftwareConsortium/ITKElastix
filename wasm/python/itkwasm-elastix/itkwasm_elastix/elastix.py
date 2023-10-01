# Generated file. Do not edit.

import os
from typing import Dict, Tuple, Optional, List, Any

from itkwasm import (
    environment_dispatch,
    Image,
    BinaryFile,
)

def elastix(
    parameter_object: Any,
    transform: str,
    fixed: Optional[Image] = None,
    moving: Optional[Image] = None,
    initial_transform: Optional[os.PathLike] = None,
    initial_transform_parameter_object: Optional[Any] = None,
) -> Tuple[Image, Any]:
    """Rigid and non-rigid registration of images.

    :param parameter_object: Elastix parameter object representation
    :type  parameter_object: Any

    :param transform: Fixed-to-moving transform file
    :type  transform: str

    :param fixed: Fixed image
    :type  fixed: Image

    :param moving: Moving image
    :type  moving: Image

    :param initial_transform: Initial transform to apply before registration
    :type  initial_transform: os.PathLike

    :param initial_transform_parameter_object: Initial elastix transform parameter object to apply before registration. Only provide this or an initial transform.
    :type  initial_transform_parameter_object: Any

    :return: Resampled moving image
    :rtype:  Image

    :return: Elastix optimized transform parameter object representation
    :rtype:  Any
    """
    func = environment_dispatch("itkwasm_elastix", "elastix")
    output = func(parameter_object, transform, fixed=fixed, moving=moving, initial_transform=initial_transform, initial_transform_parameter_object=initial_transform_parameter_object)
    return output
