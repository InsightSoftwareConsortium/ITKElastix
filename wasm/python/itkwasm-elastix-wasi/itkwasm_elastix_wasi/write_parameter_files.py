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
    TextFile,
)

def write_parameter_files(
    parameter_object: Any,
    parameter_files: List[str],
) -> os.PathLike:
    """Write an elastix parameter text file from a parameter object.

    :param parameter_object: Elastix parameter object representation.
    :type  parameter_object: Any

    :param parameter_files: Elastix parameter files, must have the same length as the number of parameter maps in the parameter object.
    :type  parameter_files: List[str]
    """
    global _pipeline
    if _pipeline is None:
        _pipeline = Pipeline(file_resources('itkwasm_elastix_wasi').joinpath(Path('wasm_modules') / Path('write-parameter-files.wasi.wasm')))
    parameter_files_pipeline_outputs = [PipelineOutput(InterfaceTypes.TextFile, TextFile(PurePosixPath(p))) for p in parameter_files]

    pipeline_outputs: List[PipelineOutput] = [
        *parameter_files_pipeline_outputs,
    ]
    output_index = 0
    parameter_files_start = output_index
    output_index += len(parameter_files)
    parameter_files_end = output_index

    pipeline_inputs: List[PipelineInput] = [
        PipelineInput(InterfaceTypes.JsonCompatible, parameter_object),
    ]

    args: List[str] = ['--memory-io',]
    # Inputs
    args.append('0')
    # Outputs
    args.extend([str(PurePosixPath(p)) for p in parameter_files])

    # Options
    input_count = len(pipeline_inputs)

    outputs = _pipeline.run(args, pipeline_outputs, pipeline_inputs)


