# Generated file. Do not edit.

import os
from typing import Dict, Tuple, Optional, List, Any

from itkwasm import (
    environment_dispatch,
    TextFile,
)

async def read_parameter_file_async(
    parameter_file: os.PathLike,
) -> Any:
    """Read an elastix parameter text file into a parameter object.

    :param parameter_file: Elastix parameter file
    :type  parameter_file: os.PathLike

    :return: Elastix parameter object representation
    :rtype:  Any
    """
    func = environment_dispatch("itkwasm_elastix", "read_parameter_file_async")
    output = await func(parameter_file)
    return output
