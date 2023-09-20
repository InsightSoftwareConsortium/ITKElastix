# Generated file. Do not edit.

import os
from typing import Dict, Tuple, Optional, List, Any

from itkwasm import (
    environment_dispatch,
    TextFile,
)

def read_parameter_file(
    parameter_files: List[os.PathLike] = [],
) -> Any:
    """Read an elastix parameter text file into a parameter object.

    :param parameter_files: Elastix parameter files
    :type  parameter_files: os.PathLike

    :return: Elastix parameter object representation
    :rtype:  Any
    """
    func = environment_dispatch("itkwasm_elastix", "read_parameter_file")
    output = func(parameter_files=parameter_files)
    return output
