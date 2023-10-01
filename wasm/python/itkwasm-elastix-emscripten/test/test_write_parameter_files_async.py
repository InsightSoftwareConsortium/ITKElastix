import sys

if sys.version_info < (3,10):
    pytest.skip("Skipping pyodide tests on older Python", allow_module_level=True)

from pytest_pyodide import run_in_pyodide
from .fixtures import package_wheel, input_data

@run_in_pyodide(packages=['micropip'])
async def test_write_parameter_files_async(selenium, package_wheel, input_data):
    import micropip
    await micropip.install(package_wheel)
    def write_input_data_to_fs(input_data, filename):
        with open(filename, 'wb') as fp:
            fp.write(input_data[filename])

    from itkwasm_elastix_emscripten import write_parameter_files_async

    from pathlib import Path
    import json

    parameters_multiple_file = 'parameters_multiple.json'
    write_input_data_to_fs(input_data, parameters_multiple_file)

    assert Path(parameters_multiple_file).exists()

    with open(parameters_multiple_file, 'r') as f:
        parameters_multiple = json.load(f)

    translation_file = 'translation.txt'
    affine_file = 'affine.txt'

    await write_parameter_files_async(parameters_multiple, [translation_file, affine_file])

    assert Path(translation_file).exists()
    assert Path(affine_file).exists()