import pytest
import sys
import glob

if sys.version_info < (3,10):
    pytest.skip("Skipping pyodide tests on older Python", allow_module_level=True)

from pytest_pyodide import run_in_pyodide

from itkwasm_elastix_emscripten import __version__ as test_package_version

@pytest.fixture
def package_wheel():
    return f"itkwasm_elastix_emscripten-{test_package_version}-py3-none-any.whl"

@pytest.fixture
def input_data():
    from pathlib import Path
    input_base_path = Path(__file__).parent.parent / 'test' / 'data'
    test_files = list(input_base_path.glob('*'))
    data = {}
    for test_file in test_files:
        with open(test_file, 'rb') as f:
            data[test_file.name] = f.read()
    return data
