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
    TextFile,
)

def read_parameter_file(
    parameter_files: List[os.PathLike] = [],
) -> Any:
    """Read an elastix parameter text file into a parameter object.

    :param parameter_files: Elastix parameter files
    :type  parameter_files: os.PathLike

    :return: Elastix parameter object representation
    :rtype:  Any
    """
    global _pipeline
    if _pipeline is None:
        _pipeline = Pipeline(file_resources('itkwasm_elastix_wasi').joinpath(Path('wasm_modules') / Path('read-parameter-file.wasi.wasm')))

    pipeline_outputs: List[PipelineOutput] = [
        PipelineOutput(InterfaceTypes.JsonCompatible),
    ]

    pipeline_inputs: List[PipelineInput] = [
    ]

    args: List[str] = ['--memory-io',]
    # Inputs
    # Outputs
    args.append('0')
    # Options
    if len(parameter_files) < 1:
       raise ValueError('"parameter-files" kwarg must have a length > 1')
    if len(parameter_files) > 0:
        args.append('--parameter-files')
        for value in parameter_files:
            input_file = str(PurePosixPath(parameter_files))
            pipeline_inputs.append(PipelineInput(InterfaceTypes.TextFile, TextFile(value)))
            args.append(input_file)


    outputs = _pipeline.run(args, pipeline_outputs, pipeline_inputs)

    result = outputs[0].data.data
    return result

