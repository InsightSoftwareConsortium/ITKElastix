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
    Image,
)

async def transformix_async(
    moving: Image,
    transform_parameter_object: Any,
    output_origin: Optional[List[float]] = None,
    output_spacing: Optional[List[float]] = None,
    output_size: Optional[List[int]] = None,
    output_direction: Optional[List[float]] = None,
) -> Image:
    """Apply an elastix transform parameter object to an image.

    :param moving: Moving image
    :type  moving: Image

    :param transform_parameter_object: Elastix transform parameter object to apply. Only provide this or an initial transform.
    :type  transform_parameter_object: Any

    :param output_origin: Output image origin.
    :type  output_origin: float

    :param output_spacing: Output image spacing.
    :type  output_spacing: float

    :param output_size: Output image size.
    :type  output_size: int

    :param output_direction: Output image orientation direction matrix.
    :type  output_direction: float

    :return: Resampled moving image
    :rtype:  Image
    """
    js_module = await js_package.js_module
    web_worker = js_resources.web_worker

    kwargs = {}
    if output_origin:
        kwargs["outputOrigin"] = to_js(output_origin)
    if output_spacing:
        kwargs["outputSpacing"] = to_js(output_spacing)
    if output_size:
        kwargs["outputSize"] = to_js(output_size)
    if output_direction:
        kwargs["outputDirection"] = to_js(output_direction)

    outputs = await js_module.transformix(to_js(moving), to_js(transform_parameter_object), webWorker=web_worker, noCopy=True, **kwargs)

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
