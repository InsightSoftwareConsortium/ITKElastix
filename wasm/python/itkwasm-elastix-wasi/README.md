# itkwasm-elastix-wasi

[![PyPI version](https://badge.fury.io/py/itkwasm-elastix-wasi.svg)](https://badge.fury.io/py/itkwasm-elastix-wasi)

A toolbox for rigid and nonrigid registration of images. WASI implementation.

This package provides the WASI WebAssembly implementation. It is usually not called directly. Please use [`itkwasm-elastix`](https://pypi.org/project/itkwasm-elastix/) instead.


## Installation

```sh
pip install itkwasm-elastix-wasi
```

## Development

```sh
pip install pytest itkwasm-compare-images itk-io
pip install -e .
pytest

# or
pip install hatch
hatch run test
```
