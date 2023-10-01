# itkwasm-elastix-emscripten

[![PyPI version](https://badge.fury.io/py/itkwasm-elastix-emscripten.svg)](https://badge.fury.io/py/itkwasm-elastix-emscripten)

A toolbox for rigid and nonrigid registration of images. Emscripten implementation.

This package provides the Emscripten WebAssembly implementation. It is usually not called directly. Please use the [`itkwasm-elastix`](https://pypi.org/project/itkwasm-elastix/) instead.


## Installation

```sh
import micropip
await micropip.install('itkwasm-elastix-emscripten')
```

## Development

```sh
pip install hatch
hatch run download-pyodide
hatch run test
```
