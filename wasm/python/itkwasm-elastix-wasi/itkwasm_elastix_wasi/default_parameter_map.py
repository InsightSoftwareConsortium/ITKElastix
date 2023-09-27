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
)

def default_parameter_map(
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
    global _pipeline
    if _pipeline is None:
        _pipeline = Pipeline(file_resources('itkwasm_elastix_wasi').joinpath(Path('wasm_modules') / Path('default-parameter-map.wasi.wasm')))

    pipeline_outputs: List[PipelineOutput] = [
        PipelineOutput(InterfaceTypes.JsonCompatible),
    ]

    pipeline_inputs: List[PipelineInput] = [
    ]

    args: List[str] = ['--memory-io',]
    # Inputs
    args.append(str(transform_name))
    # Outputs
    parameter_map_name = '0'
    args.append(parameter_map_name)

    # Options
    input_count = len(pipeline_inputs)
    if number_of_resolutions:
        args.append('--number-of-resolutions')
        args.append(str(number_of_resolutions))

    if final_grid_spacing:
        args.append('--final-grid-spacing')
        args.append(str(final_grid_spacing))


    outputs = _pipeline.run(args, pipeline_outputs, pipeline_inputs)

    result = outputs[0].data
    return result

