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
)

async def default_parameter_map_async(
    transform_name: str,
    number_of_resolutions: int = 4,
    final_grid_spacing: float = 10,
) -> Any:
    """Returns the default elastix parameter map for a given transform type.

    :param transform_name: Transform name. One of: translation, rigid, affine, bspline, spline, groupwise
    :type  transform_name: str

    :param number_of_resolutions: Number of multiscale registration resolutions.
    :type  number_of_resolutions: int

    :param final_grid_spacing: Final grid spacing in physical units for bspline transforms.
    :type  final_grid_spacing: float

    :return: Elastix parameter map representation
    :rtype:  Any
    """
    js_module = await js_package.js_module
    web_worker = js_resources.web_worker

    kwargs = {}
    if number_of_resolutions:
        kwargs["numberOfResolutions"] = to_js(number_of_resolutions)
    if final_grid_spacing:
        kwargs["finalGridSpacing"] = to_js(final_grid_spacing)

    outputs = await js_module.defaultParameterMap(to_js(transform_name), webWorker=web_worker, noCopy=True, **kwargs)

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
