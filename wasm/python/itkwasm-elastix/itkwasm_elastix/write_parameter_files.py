# Generated file. Do not edit.

import os
from typing import Dict, Tuple, Optional, List, Any

from itkwasm import (
    environment_dispatch,
    TextFile,
)

def write_parameter_files(
    parameter_object: Any,
    parameter_files: List[str],
) -> os.PathLike:
    """Write an elastix parameter text file from a parameter object.

    :param parameter_object: Elastix parameter object representation.
    :type  parameter_object: Any

    :param parameter_files: Elastix parameter files, must have the same length as the number of parameter maps in the parameter object.
    :type  parameter_files: List[str]
    """
    func = environment_dispatch("itkwasm_elastix", "write_parameter_files")
    output = func(parameter_object, parameter_files)
    return output
