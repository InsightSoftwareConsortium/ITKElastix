# Generated file. To retain edits, remove this comment.

from pathlib import Path
import os
from typing import Dict, Tuple, Optional, List, Any

from .js_package import js_package

from itkwasm.pyodide import (
    to_js,
    to_py,
    js_resources
)
from itkwasm import (
    InterfaceTypes,
    TextFile,
)

async def write_parameter_files_async(
    parameter_object: Any,
    parameter_files: List[str],
) -> os.PathLike:
    """Write an elastix parameter text file from a parameter object.

    :param parameter_object: Elastix parameter object representation.
    :type  parameter_object: Any

    :param parameter_files: Elastix parameter files, must have the same length as the number of parameter maps in the parameter object.
    :type  parameter_files: List[str]
    """
    js_module = await js_package.js_module
    web_worker = js_resources.web_worker

    kwargs = {}

    outputs = await js_module.writeParameterFiles(to_js(parameter_object), to_js(parameter_files), webWorker=web_worker, noCopy=True, **kwargs)

    output_web_worker = None
    output_list = []
    outputs_object_map = outputs.as_object_map()
    for output_name in outputs.object_keys():
        if output_name == 'webWorker':
            output_web_worker = outputs_object_map[output_name]
        else:
            output_list.append(to_py(outputs_object_map[output_name]))

    js_resources.web_worker = output_web_worker

    if len(output_list) == 1:
        return output_list[0]
    return tuple(output_list)
