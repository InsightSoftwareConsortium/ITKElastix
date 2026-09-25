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
    """Write elastix parameter files, in the legacy text (.txt) or TOML (.toml) format, from a parameter object.

    :param parameter_object: Elastix parameter object representation.
    :type  parameter_object: Any

    :param parameter_files: Elastix parameter files, must have the same length as the number of parameter maps in the parameter object. The file extension selects the format: .txt for the legacy text format, .toml for TOML.
    :type  parameter_files: List[str]
    """
    func = environment_dispatch("itkwasm_elastix", "write_parameter_files")
    output = func(parameter_object, parameter_files)
    return output
