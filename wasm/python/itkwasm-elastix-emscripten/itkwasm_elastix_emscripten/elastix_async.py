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
    BinaryFile,
)

async def elastix_async(
    parameter_object: Any,
    transform: str,
    fixed: Optional[Image] = None,
    moving: Optional[Image] = None,
    initial_transform: Optional[os.PathLike] = None,
    initial_transform_parameter_object: Optional[Any] = None,
) -> Tuple[Image, Any]:
    """Rigid and non-rigid registration of images.

    :param parameter_object: Elastix parameter object representation
    :type  parameter_object: Any

    :param transform: Fixed-to-moving transform file
    :type  transform: str

    :param fixed: Fixed image
    :type  fixed: Image

    :param moving: Moving image
    :type  moving: Image

    :param initial_transform: Initial transform to apply before registration
    :type  initial_transform: os.PathLike

    :param initial_transform_parameter_object: Initial elastix transform parameter object to apply before registration. Only provide this or an initial transform.
    :type  initial_transform_parameter_object: Any

    :return: Resampled moving image
    :rtype:  Image

    :return: Elastix optimized transform parameter object representation
    :rtype:  Any
    """
    js_module = await js_package.js_module
    web_worker = js_resources.web_worker

    kwargs = {}
    if fixed is not None:
        kwargs["fixed"] = to_js(fixed)
    if moving is not None:
        kwargs["moving"] = to_js(moving)
    if initial_transform is not None:
        kwargs["initialTransform"] = to_js(BinaryFile(initial_transform))
    if initial_transform_parameter_object is not None:
        kwargs["initialTransformParameterObject"] = to_js(initial_transform_parameter_object)

    outputs = await js_module.elastix(to_js(parameter_object), to_js(transform), webWorker=web_worker, noCopy=True, **kwargs)

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
