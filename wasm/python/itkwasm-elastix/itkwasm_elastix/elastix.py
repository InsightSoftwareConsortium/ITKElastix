# Generated file. Do not edit.

import os
from typing import Dict, Tuple, Optional, List, Any

from itkwasm import (
    environment_dispatch,
    Image,
    BinaryFile,
)

def elastix(
    fixed: Optional[Image] = None,
    moving: Optional[Image] = None,
) -> Tuple[Image, os.PathLike]:
    """Rigid and non-rigid registration of images.

    :param fixed: Fixed image
    :type  fixed: Image

    :param moving: Moving image
    :type  moving: Image

    :return: Resampled moving image
    :rtype:  Image

    :return: Fixed-to-moving transform
    :rtype:  os.PathLike
    """
    func = environment_dispatch("itkwasm_elastix", "elastix")
    output = func(fixed=fixed, moving=moving)
    return output
