from itkwasm.pyodide import JsPackageConfig, JsPackage

from ._version import __version__

default_config = JsPackageConfig(f"https://cdn.jsdelivr.net/npm/@itk-wasm/elastix@{__version__}/dist/bundles/elastix.js")
js_package = JsPackage(default_config)
