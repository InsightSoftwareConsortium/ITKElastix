ITKElastix
==========

[![WebAssembly](https://github.com/InsightSoftwareConsortium/ITKElastix/actions/workflows/wasm.yml/badge.svg)](https://github.com/InsightSoftwareConsortium/ITKElastix/actions/workflows/wasm.yml)
![image](https://github.com/InsightSoftwareConsortium/ITKElastix/workflows/Build/badge.svg)
[![PyPI Version](https://img.shields.io/pypi/v/itk-elastix.svg)](https://pypi.python.org/pypi/itk-elastix)
[![binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/InsightSoftwareConsortium/ITKElastix/main?urlpath=lab/tree/examples%2FITK_Example01_SimpleRegistration.ipynb)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/InsightSoftwareConsortium/ITKElastix/blob/main/LICENSE)
[![Versioned software citation](https://zenodo.org/badge/207451937.svg)](https://zenodo.org/badge/latestdoi/207451937)
[![CZI's Essential Open Source Software for Science](https://img.shields.io/badge/funded%20by-EOSS-FF414B)](https://czi.co/EOSS)

Overview
--------

Provides an [ITK](https://www.itk.org) Python, JavaScript, and WebAssembly interface to [elastix](https://elastix.dev/), a toolbox for rigid and nonrigid registration of images.

elastix is open source software, based on the well-known [Insight Toolkit (ITK)](https://discourse.itk.org). The software consists of a collection of algorithms that are commonly used to solve (medical) image registration problems. The modular design of elastix allows the user to quickly configure, test, and compare different registration methods for a specific application.

The demo performs affine registration with elastix entirely in the browser: it takes OME-Zarr, OME-TIFF, or any ITK-readable images as input, renders the fixed, moving, and registered images with niivue, and writes the registered image and the fixed-to-moving transform back out as OME-Zarr.

[👨‍💻 **Live Demo** ✨](https://insightsoftwareconsortium.github.io/ITKElastix/)

Installation
------------

Install cross-platform native binary Python packages with [pip](https://pypi.org/project/pip/):

```sh
pip install itk-elastix
```

*Experimental* WebAssembly Python packages can be installed across platforms with:

```sh
pip install itkwasm-elastix
```

> **Note**
The API for the WebAssembly and native binary packages are slightly different. For the WebAssembly interface, see [the package's Sphinx documentation](https://py.docs.elastix.wasm.itk.eth.limo/). For the interface to the native binaries, see the *examples/* directory in this repository.

JavaScript / TypesScript packages cas be installed with

```sh
npm install @itk-wasm/elastix
```


Usage
-----

To register two images with the native Python binaries, traditionally called the fixed image and the moving image:

    import itk

    fixed_image = itk.imread('path/to/fixed_image.mha')
    moving_image = itk.imread('path/to/moving_image.mha')

    registered_image, params = itk.elastix_registration_method(fixed_image, moving_image)

Interactive examples and tutorial material can be found in the [examples](https://github.com/InsightSoftwareConsortium/ITKElastix/tree/main/examples) directory. Run the examples in free cloud compute containers [on MyBinder](https://mybinder.org/v2/gh/InsightSoftwareConsortium/ITKElastix/main?urlpath=lab/tree/examples%2FITK_Example01_SimpleRegistration.ipynb) or clone the repository and run the notebooks locally in [Jupyter Notebook or Jupyter Lab](https://jupyter.org/). Try out the *experimental* GPU packages [on Paperspace Gradient](https://www.paperspace.com/temmx3m64/notebook/prdfn7bsz).

ITKElastix can be used with both the [procedural](https://docs.python.org/3/howto/functional.html) and the [object oriented method](https://docs.python.org/3/howto/functional.html), as shown in the example notebooks. The procedural method is shorter, less explicit and currently slightly less functional than the object oriented method, however the execution time and output do not differ apart from possible differences due to the stochastic nature of the Elastix algorithm.

To find parameters that work well with specific datasets, see the [elastix Model Zoo](https://lkeb.ml/modelzoo/).

For a graphical user interface in a desktop application, see the [napari plugin](https://github.com/SuperElastix/elastix_napari).

Additional [documentation is available for the WebAssembly JavaScript bindings](https://js.docs.elastix.wasm.itk.eth.limo/) and [WebAssembly Python bindings](https://py.docs.elastix.wasm.itk.eth.limo/).


Acknowledgements
----------------

ITKElastix was developed in part with support from:

- [NIH NIMH BRAIN Initiative](https://braininitiative.nih.gov/) under award 1RF1MH126732.
- The [Essential Open Source Software for Science (EOSS)](https://czi.co/EOSS) program, Cycles 4 and 6, at [Chan Zuckerberg Initiative](https://chanzuckerberg.com/) under the awards [Open Source Image Registration: The elastix Toolbox](https://chanzuckerberg.com/eoss/proposals/open-source-image-registration-the-elastix-toolbox/).

The lead developers of elastix are [Stefan Klein](https://github.com/stefanklein) and [Marius Staring](https://github.com/mstaring).

This software was initially developed at the Image Sciences Institute, under supervision of Josien P.W. Pluim. Today, [many](https://github.com/SuperElastix/elastix/graphs/contributors) have
contributed to elastix.

If you use this software anywhere we would appreciate if you cite the following articles:

-   K. Ntatsis, N. Dekker, V. Valk, T. Birdsong, D. Zukić, S. Klein, M Staring, M McCormick,
    [\"itk-elastix: Medical image registration in Python\"](https://conference.scipy.org/proceedings/scipy2023/konstantinos_ntatsis.html),
    Proceedings of the 22nd Python in Science Conference,
    pp. 101 - 105, 2023, https://doi.org/10.25080/gerudo-f2bc6f59-00d.

-   D.P. Shamonin, E.E. Bron, B.P.F. Lelieveldt, M. Smits, S. Klein
    and M. Staring, \"Fast Parallel Image Registration on CPU and GPU
    for Diagnostic Classification of Alzheimer's Disease\", Frontiers in
    Neuroinformatics, vol. 7, no. 50, pp. 1-15, January 2014.

This ITK module is based on [SimpleElastix](https://simpleelastix.github.io/), created by [Kasper Marstal](https://github.com/kaspermarstal). For more information, see:

-   Kasper Marstal, Floris Berendsen, Marius Staring and Stefan Klein,
    \"SimpleElastix: A user-friendly, multi-lingual library for medical
    image registration\", International Workshop on Biomedical Image
    Registration (WBIR), Las Vegas, Nevada, USA, 2016
