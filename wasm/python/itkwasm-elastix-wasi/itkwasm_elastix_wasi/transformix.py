# Generated file. To retain edits, remove this comment.

from pathlib import Path, PurePosixPath
import os
from typing import Dict, Tuple, Optional, List, Any

from importlib_resources import files as file_resources

_pipeline = None

from itkwasm import (
    InterfaceTypes,
    PipelineOutput,
    PipelineInput,
    Pipeline,
    Image,
    TransformList,
)

def transformix(
    moving: Image,
    transform_parameter_object: Optional[Any] = None,
    transform: Optional[TransformList] = None,
    output_origin: Optional[List[float]] = None,
    output_spacing: Optional[List[float]] = None,
    output_size: Optional[List[int]] = None,
    output_direction: Optional[List[float]] = None,
) -> Image:
    """Apply an elastix transform parameter object or an ITK transform to an image.

    :param moving: Moving image
    :type  moving: Image

    :param transform_parameter_object: Elastix transform parameter object to apply. Provide this and/or an ITK transform. When both are provided, only its output image domain and resample interpolator are used.
    :type  transform_parameter_object: Any

    :param transform: ITK transform to apply. Provide this and/or a transform parameter object. The output image domain defaults to the moving image domain.
    :type  transform: TransformList

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
    global _pipeline
    if _pipeline is None:
        _pipeline = Pipeline(file_resources('itkwasm_elastix_wasi').joinpath(Path('wasm_modules') / Path('transformix.wasi.wasm')))

    pipeline_outputs: List[PipelineOutput] = [
        PipelineOutput(InterfaceTypes.Image),
    ]

    pipeline_inputs: List[PipelineInput] = [
        PipelineInput(InterfaceTypes.Image, moving),
    ]

    args: List[str] = ['--memory-io',]
    # Inputs
    args.append('0')
    # Outputs
    result_name = '0'
    args.append(result_name)

    # Options
    input_count = len(pipeline_inputs)
    if transform_parameter_object is not None:
        pipeline_inputs.append(PipelineInput(InterfaceTypes.JsonCompatible, transform_parameter_object))
        args.append('--transform-parameter-object')
        args.append(str(input_count))
        input_count += 1

    if transform is not None:
        pipeline_inputs.append(PipelineInput(InterfaceTypes.TransformList, transform))
        args.append('--transform')
        args.append(str(input_count))
        input_count += 1

    if output_origin is not None and len(output_origin) < 1:
       raise ValueError('"output-origin" kwarg must have a length > 1')
    if output_origin is not None and len(output_origin) > 0:
        args.append('--output-origin')
        for value in output_origin:
            args.append(str(value))

    if output_spacing is not None and len(output_spacing) < 1:
       raise ValueError('"output-spacing" kwarg must have a length > 1')
    if output_spacing is not None and len(output_spacing) > 0:
        args.append('--output-spacing')
        for value in output_spacing:
            args.append(str(value))

    if output_size is not None and len(output_size) < 1:
       raise ValueError('"output-size" kwarg must have a length > 1')
    if output_size is not None and len(output_size) > 0:
        args.append('--output-size')
        for value in output_size:
            args.append(str(value))

    if output_direction is not None and len(output_direction) < 1:
       raise ValueError('"output-direction" kwarg must have a length > 1')
    if output_direction is not None and len(output_direction) > 0:
        args.append('--output-direction')
        for value in output_direction:
            args.append(str(value))


    outputs = _pipeline.run(args, pipeline_outputs, pipeline_inputs)

    result = outputs[0].data
    return result

