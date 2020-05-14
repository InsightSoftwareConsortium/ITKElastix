ITKElastix
=================================

.. image:: https://github.com/InsightSoftwareConsortium/ITKElastix/workflows/Build,%20test,%20package/badge.svg

.. image:: https://dev.azure.com/ITKElastix/ITKElastix/_apis/build/status/InsightSoftwareConsortium.ITKElastix?branchName=master
    :target: https://dev.azure.com/ITKElastix/ITKElastix/_build/latest?definitionId=1&branchName=master
    :alt:    Build Status

.. image:: https://img.shields.io/pypi/v/itk-elastix.svg
    :target: https://pypi.python.org/pypi/itk-elastix
    :alt: PyPI Version

.. image:: https://mybinder.org/badge_logo.svg
   :target: https://mybinder.org/v2/gh/InsightSoftwareConsortium/ITKElastix/master?urlpath=lab/tree/examples%2F0_HelloRegistrationWorld.ipynb

.. image:: https://img.shields.io/badge/License-Apache%202.0-blue.svg
    :target: https://github.com/InsightSoftwareConsortium/ITKElastix/blob/master/LICENSE)
    :alt: License

.. image:: https://zenodo.org/badge/207451937.svg
    :target: https://zenodo.org/badge/latestdoi/207451937
    :alt: Versioned software citation

Overview
--------

Provides an `ITK <https://www.itk.org>`_ Python interface to `elastix <http://elastix.isi.uu.nl/>`_, a toolbox for rigid and nonrigid registration of images.

elastix is open source software, based on the well-known `Insight Toolkit
(ITK) <https://discourse.itk.org>`_. The software consists of a collection of algorithms that are commonly
used to solve (medical) image registration problems. The modular design of
elastix allows the user to quickly configure, test, and compare different
registration methods for a specific application.

Installation
------------

Install cross-platform binary Python packages with::

  pip install itk-elastix

*Experimental* GPU-accelerated packages can be installed on Linux with::

  pip install itk-elastix-opencl

Usage
-----

To register two images, traditionally called the fixed image and the moving
image::

  import itk

  fixed_image = itk.imread('path/to/fixed_image.mha')
  moving_image = itk.imread('path/to/moving_image.mha')

  registered_image = itk.elastix_registration_method(fixed_image, moving_image)

Interactive examples and tutorial material can be found in the
`examples <https://github.com/InsightSoftwareConsortium/ITKElastix/tree/master/examples>`_ directory.
Run the examples in free cloud compute containers `on MyBinder <https://mybinder.org/v2/gh/InsightSoftwareConsortium/ITKElastix/master?urlpath=lab/tree/examples%2F0_HelloRegistrationWorld.ipynb>`_. Try out the *experimental* GPU packages `on Paperspace Gradient <https://www.paperspace.com/temmx3m64/notebook/prdfn7bsz>`_.

Acknowledgements
----------------

The lead developers of elastix are `Stefan Klein
<https://github.com/stefanklein>`_ and `Marius Staring
<https://github.com/mstaring>`_.

This software was initially developed at the Image Sciences Institute, under supervision of Josien P.W. Pluim. Today, `many <https://github.com/SuperElastix/elastix/graphs/contributors>`_ have contributed to elastix.

If you use this software anywhere we would appreciate if you cite the following articles:

* S. Klein, M. Staring, K. Murphy, M.A. Viergever, J.P.W. Pluim, "elastix: a toolbox for intensity based medical image registration," IEEE Transactions on Medical Imaging, vol. 29, no. 1, pp. 196 - 205, January 2010.

* D.P. Shamonin, E.E. Bron, B.P.F. Lelieveldt, M. Smits, S. Klein and M. Staring, "Fast Parallel Image Registration on CPU and GPU for Diagnostic Classification of Alzheimer’s Disease", Frontiers in Neuroinformatics, vol. 7, no. 50, pp. 1-15, January 2014.

This ITK module is based on `SimpleElastix
<http://simpleelastix.github.io/>`_, created by Kasper Marstal. For more
information, see:

* Kasper Marstal, Floris Berendsen, Marius Staring and Stefan Klein, "SimpleElastix: A user-friendly, multi-lingual library for medical image registration", International Workshop on Biomedical Image Registration (WBIR), Las Vegas, Nevada, USA, 2016
