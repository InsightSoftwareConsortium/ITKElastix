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
    fixed: Optional[Image] = None,
    moving: Optional[Image] = None,
) -> Tuple[Image, os.PathLike]:
    """Rigid and non-rigid registration of images.

    :param fixed: Fixed image
    :type  fixed: Image

    :param moving: Moving image
    :type  moving: Image

    :return: Resampled moving image
    :rtype:  Image

    :return: Fixed-to-moving transform
    :rtype:  os.PathLike
    """
    global _pipeline
    if _pipeline is None:
        _pipeline = Pipeline(file_resources('itkwasm_elastix_wasi').joinpath(Path('wasm_modules') / Path('elastix.wasi.wasm')))

    pipeline_outputs: List[PipelineOutput] = [
        PipelineOutput(InterfaceTypes.Image),
        PipelineOutput(InterfaceTypes.BinaryFile, BinaryFile(PurePosixPath(transform))),
    ]

    pipeline_inputs: List[PipelineInput] = [
    ]

    args: List[str] = ['--memory-io',]
    # Inputs
    # Outputs
    args.append('0')
    args.append(str(PurePosixPath(transform)))
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


    outputs = _pipeline.run(args, pipeline_outputs, pipeline_inputs)

    result = (
        outputs[0].data,
        Path(outputs[1].data.path),
    )
    return result

