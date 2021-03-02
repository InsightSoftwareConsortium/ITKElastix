#!/bin/bash

# Run this script to build the Python wheel packages for Linux for an ITK
# external module.
#
# Versions can be restricted by passing them in as arguments to the script
# For example,
#
#   scripts/dockcross-manylinux-build-module-wheels.sh cp39

# Generate dockcross scripts
docker run --rm dockcross/manylinux2014-x64:20201015-96d8741 > /tmp/dockcross-manylinux-x64
chmod u+x /tmp/dockcross-manylinux-x64

script_dir=$(cd $(dirname $0) || exit 1; pwd)

if ! test -d ./OpenCL-ICD-Loader; then
  git clone https://github.com/KhronosGroup/OpenCL-ICD-Loader
  pushd OpenCL-ICD-Loader
  git checkout 978b4b3a29a3aebc86ce9315d5c5963e88722d03
  popd
  pushd OpenCL-ICD-Loader/inc
  git clone https://github.com/KhronosGroup/OpenCL-Headers
  pushd OpenCL-Headers
  git checkout c5a4bbeabb10d8ed3d1c651b93aa31737bc473dd
  popd
  cp -r OpenCL-Headers/CL ./
  popd
  mkdir OpenCL-ICD-Loader-build
  /tmp/dockcross-manylinux-x64 cmake -BOpenCL-ICD-Loader-build -HOpenCL-ICD-Loader -GNinja
  /tmp/dockcross-manylinux-x64 ninja -COpenCL-ICD-Loader-build

  rm -rf ITKPythonPackage/standalone-x64-build/ITKs/Modules/Core/GPUCommon/
fi

# Build wheels
mkdir -p dist
DOCKER_ARGS="-e ELASTIX_USE_OPENCL=1 -v $(pwd)/dist:/work/dist/ -v $script_dir/../ITKPythonPackage:/ITKPythonPackage -v $(pwd)/tools:/tools -v $(pwd)/OpenCL-ICD-Loader/inc/CL:/usr/include/CL -v $(pwd)/OpenCL-ICD-Loader-build/libOpenCL.so.1.2:/usr/lib64/libOpenCL.so.1 -v $(pwd)/OpenCL-ICD-Loader-build/libOpenCL.so.1.2:/usr/lib64/libOpenCL.so"
/tmp/dockcross-manylinux-x64 \
  -a "$DOCKER_ARGS" \
  "/ITKPythonPackage/scripts/internal/manylinux-build-module-wheels.sh" "$@"
