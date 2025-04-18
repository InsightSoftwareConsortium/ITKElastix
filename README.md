ITKElastix
==========

[![WebAssembly](https://github.com/InsightSoftwareConsortium/ITKElastix/actions/workflows/wasm.yml/badge.svg)](https://github.com/InsightSoftwareConsortium/ITKElastix/actions/workflows/wasm.yml)
![image](https://github.com/InsightSoftwareConsortium/ITKElastix/workflows/Build/badge.svg)
[![PyPI Version](https://img.shields.io/pypi/v/itk-elastix.svg)](https://pypi.python.org/pypi/itk-elastix)
[![binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/InsightSoftwareConsortium/ITKElastix/main?urlpath=lab/tree/examples%2FITK_Example01_SimpleRegistration.ipynb)
[![voila](https://img.shields.io/badge/launch-3d%20registration%20app-E66581.svg?logo=data:image/png;base64,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)](https://mybinder.org/v2/gh/InsightSoftwareConsortium/ITKElastix/main?urlpath=%2Fvoila%2Frender%2Fexamples%2FITK_Registration_App.ipynb)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/InsightSoftwareConsortium/ITKElastix/blob/main/LICENSE)
[![Versioned software citation](https://zenodo.org/badge/207451937.svg)](https://zenodo.org/badge/latestdoi/207451937)
[![CZI's Essential Open Source Software for Science](https://img.shields.io/badge/funded%20by-EOSS-FF414B)](https://czi.co/EOSS)

Overview
--------

Provides an [ITK](https://www.itk.org) Python, JavaScript, and WebAssembly interface to [elastix](https://elastix.dev/), a toolbox for rigid and nonrigid registration of images.

elastix is open source software, based on the well-known [Insight Toolkit (ITK)](https://discourse.itk.org). The software consists of a collection of algorithms that are commonly used to solve (medical) image registration problems. The modular design of elastix allows the user to quickly configure, test, and compare different registration methods for a specific application.

[👨‍💻 **Live JavaScript API Demo** ✨](https://itk-wasm-elastix-app-js.on.fleek.co/ ':include :type=iframe width=100% height=800px')

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

-   Kasper Marstal, Floris Berendsen, Marius Staring and Stefajkn Klein,
    \"SimpleElastix: A user-friendly, multi-lingual library for medical
    image registration\", International Workshop on Biomedical Image
    Registration (WBIR), Las Vegas, Nevada, USA, 2016
