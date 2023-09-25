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
    fixed: Optional[Image] = None,
    moving: Optional[Image] = None,
    initial_transform: Optional[os.PathLike] = None,
) -> Tuple[Image, os.PathLike]:
    """Rigid and non-rigid registration of images.

    :param parameter_object: Elastix parameter object representation
    :type  parameter_object: Any

    :param fixed: Fixed image
    :type  fixed: Image

    :param moving: Moving image
    :type  moving: Image

    :param initial_transform: Initial transform to apply before registrtion 
    :type  initial_transform: os.PathLike

    :return: Resampled moving image
    :rtype:  Image

    :return: Fixed-to-moving transform
    :rtype:  os.PathLike
    """
    func = environment_dispatch("itkwasm_elastix", "elastix")
    output = func(parameter_object, fixed=fixed, moving=moving, initial_transform=initial_transform)
    return output
