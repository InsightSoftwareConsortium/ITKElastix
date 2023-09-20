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
    parameter_file: os.PathLike,
) -> Any:
    """Read an elastix parameter text file into a parameter object.

    :param parameter_file: Elastix parameter file
    :type  parameter_file: os.PathLike

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
        PipelineInput(InterfaceTypes.TextFile, TextFile(PurePosixPath(parameter_file))),
    ]

    args: List[str] = ['--memory-io',]
    # Inputs
    if not Path(parameter_file).exists():
        raise FileNotFoundError("parameter_file does not exist")
    args.append(str(PurePosixPath(parameter_file)))
    # Outputs
    args.append('0')
    # Options

    outputs = _pipeline.run(args, pipeline_outputs, pipeline_inputs)

    result = outputs[0].data.data
    return result

