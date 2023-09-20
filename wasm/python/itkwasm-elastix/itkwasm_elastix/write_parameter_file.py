# Generated file. Do not edit.

import os
from typing import Dict, Tuple, Optional, List, Any

from itkwasm import (
    environment_dispatch,
    TextFile,
)

def write_parameter_file(
    parameter_object: Any,
) -> os.PathLike:
    """Write an elastix parameter text file from a parameter object.

    :param parameter_object: Elastix parameter object representation
    :type  parameter_object: Any

    :return: Elastix parameter file
    :rtype:  os.PathLike
    """
    func = environment_dispatch("itkwasm_elastix", "write_parameter_file")
    output = func(parameter_object)
    return output