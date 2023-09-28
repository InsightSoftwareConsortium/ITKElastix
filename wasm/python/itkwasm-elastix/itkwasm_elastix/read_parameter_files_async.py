# Generated file. Do not edit.

import os
from typing import Dict, Tuple, Optional, List, Any

from itkwasm import (
    environment_dispatch,
    TextFile,
)

async def read_parameter_files_async(
    parameter_files: List[os.PathLike] = [],
) -> Any:
    """Read elastix parameter text files into a parameter object.

    :param parameter_files: Elastix parameter files
    :type  parameter_files: os.PathLike

    :return: Elastix parameter object representation
    :rtype:  Any
    """
    func = environment_dispatch("itkwasm_elastix", "read_parameter_files_async")
    output = await func(parameter_files=parameter_files)
    return output
