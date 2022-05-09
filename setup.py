# -*- coding: utf-8 -*-
from __future__ import print_function
from os import sys
import os

try:
    from skbuild import setup
except ImportError:
    print('scikit-build is required to build from source.', file=sys.stderr)
    print('Please run:', file=sys.stderr)
    print('', file=sys.stderr)
    print('  python -m pip install scikit-build')
    sys.exit(1)

package_name = 'itk-elastix'
if 'ELASTIX_USE_OPENCL' in os.environ:
    package_name = 'itk-elastix-opencl'

setup(
    name=package_name,
    version='0.14.1',
    author='Insight Software Consortium',
    author_email='itk+community@discourse.itk.org',
    packages=['itk'],
    package_dir={'itk': 'itk'},
    download_url=r'https://github.com/InsightSoftwareConsortium/ITKElastix',
    description=r'Provides an ITK Python interface to elastix, a toolbox for rigid and nonrigid registration of images',
    long_description='elastix is open source software, based on the well-known Insight Segmentation and Registration Toolkit (ITK). The software consists of a collection of algorithms that are commonly used to solve (medical) image registration problems. The modular design of elastix allows the user to quickly configure, test, and compare different registration methods for a specific application.',
    classifiers=[
        "License :: OSI Approved :: Apache Software License",
        "Programming Language :: Python",
        "Programming Language :: C++",
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Intended Audience :: Education",
        "Intended Audience :: Healthcare Industry",
        "Intended Audience :: Science/Research",
        "Topic :: Scientific/Engineering",
        "Topic :: Scientific/Engineering :: Medical Science Apps.",
        "Topic :: Scientific/Engineering :: Information Analysis",
        "Topic :: Software Development :: Libraries",
        "Operating System :: Android",
        "Operating System :: Microsoft :: Windows",
        "Operating System :: POSIX",
        "Operating System :: Unix",
        "Operating System :: MacOS"
        ],
    license='Apache',
    keywords='ITK InsightToolkit',
    url=r'https://itk.org/',
    install_requires=[
        r'itk>=5.3rc4'
    ]
    )
