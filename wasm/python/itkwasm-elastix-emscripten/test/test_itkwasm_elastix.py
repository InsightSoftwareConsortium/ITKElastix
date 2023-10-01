import pytest
import sys

if sys.version_info < (3,10):
    pytest.skip("Skipping pyodide tests on older Python", allow_module_level=True)

from pytest_pyodide import run_in_pyodide

from itkwasm_elastix_emscripten import __version__ as test_package_version

@pytest.fixture
def package_wheel():
    return f"itkwasm_elastix_emscripten-{test_package_version}-py3-none-any.whl"

@run_in_pyodide(packages=['micropip'])
async def test_example(selenium, package_wheel):
    import micropip
    await micropip.install(package_wheel)

    # Write your test code here
