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

def write_parameter_file(
    parameter_object: Any,
) -> os.PathLike:
    """Write an elastix parameter text file from a parameter object.

    :param parameter_object: Elastix parameter object representation
    :type  parameter_object: Any

    :return: Elastix parameter files
    :rtype:  os.PathLike
    """
    global _pipeline
    if _pipeline is None:
        _pipeline = Pipeline(file_resources('itkwasm_elastix_wasi').joinpath(Path('wasm_modules') / Path('write-parameter-file.wasi.wasm')))

    pipeline_outputs: List[PipelineOutput] = [
        PipelineOutput(InterfaceTypes.TextFile, TextFile(PurePosixPath(parameter_files))),
    ]

    pipeline_inputs: List[PipelineInput] = [
        PipelineInput(InterfaceTypes.JsonCompatible, parameter_object),
    ]

    args: List[str] = ['--memory-io',]
    # Inputs
    args.append('0')
    # Outputs
    args.append(str(PurePosixPath(parameter_files)))
    # Options

    outputs = _pipeline.run(args, pipeline_outputs, pipeline_inputs)

    result = Path(outputs[0].data.path)
    return result

