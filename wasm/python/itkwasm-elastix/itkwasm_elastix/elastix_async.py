# Generated file. Do not edit.

import os
from typing import Dict, Tuple, Optional, List, Any

from itkwasm import (
    environment_dispatch,
    Image,
)

async def elastix_async(
    fixed: Optional[Image] = None,
    moving: Optional[Image] = None,
) -> Image:
    """Rigid and non-rigid registration of images.

    :param fixed: Fixed image
    :type  fixed: Image

    :param moving: Moving image
    :type  moving: Image

    :return: The result image
    :rtype:  Image
    """
    func = environment_dispatch("itkwasm_elastix", "elastix_async")
    output = await func(fixed=fixed, moving=moving)
    return output
