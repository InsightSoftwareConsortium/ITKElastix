# Generated file. To retain edits, remove this comment.

# Generated file. Do not edit.

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
    BinaryFile,
)

def elastix(
    parameter_object: Any,
    fixed: Optional[Image] = None,
    moving: Optional[Image] = None,
    initial_transform: Optional[os.PathLike] = None,
    initial_transform_parameter_object: Optional[Any] = None,
) -> Tuple[Image, os.PathLike, Any]:
    """Rigid and non-rigid registration of images.

    :param parameter_object: Elastix parameter object representation
    :type  parameter_object: Any

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

    :return: Fixed-to-moving transform
    :rtype:  os.PathLike

    :return: Elastix optimized transform parameter object representation
    :rtype:  Any
    """
    global _pipeline
    if _pipeline is None:
        _pipeline = Pipeline(file_resources('itkwasm_elastix_wasi').joinpath(Path('wasm_modules') / Path('elastix.wasi.wasm')))

    pipeline_outputs: List[PipelineOutput] = [
        PipelineOutput(InterfaceTypes.Image),
        PipelineOutput(InterfaceTypes.BinaryFile, BinaryFile(PurePosixPath(transform))),
        PipelineOutput(InterfaceTypes.JsonCompatible),
    ]

    pipeline_inputs: List[PipelineInput] = [
        PipelineInput(InterfaceTypes.JsonCompatible, parameter_object),
    ]

    args: List[str] = ['--memory-io',]
    # Inputs
    args.append('0')
    # Outputs
    args.append('0')
    args.append(str(PurePosixPath(transform)))
    args.append('2')
    # Options
    if fixed is not None:
        input_count_string = str(len(pipeline_inputs))
        pipeline_inputs.append(PipelineInput(InterfaceTypes.Image, fixed))
        args.append('--fixed')
        args.append(input_count_string)

    if moving is not None:
        input_count_string = str(len(pipeline_inputs))
        pipeline_inputs.append(PipelineInput(InterfaceTypes.Image, moving))
        args.append('--moving')
        args.append(input_count_string)

    if initial_transform is not None:
        input_file = str(PurePosixPath(initial_transform))
        pipeline_inputs.append(PipelineInput(InterfaceTypes.BinaryFile, BinaryFile(initial_transform)))
        args.append('--initial-transform')
        args.append(input_file)

    if initial_transform_parameter_object is not None:
        input_count_string = str(len(pipeline_inputs))
        pipeline_inputs.append(PipelineInput(InterfaceTypes.JsonCompatible, initial_transform_parameter_object))
        args.append('--initial-transform-parameter-object')
        args.append(input_count_string)


    outputs = _pipeline.run(args, pipeline_outputs, pipeline_inputs)

    result = (
        outputs[0].data,
        Path(outputs[1].data.path),
        outputs[2].data.data,
    )
    return result

