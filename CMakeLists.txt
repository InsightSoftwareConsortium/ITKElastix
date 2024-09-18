cmake_minimum_required(VERSION 3.16.3)
project(Elastix)

if(NOT CMAKE_CXX_STANDARD OR CMAKE_CXX_STANDARD LESS 17)
  # SuperElastix/elastix uses C++17 specific features in some of its header files.
  set(CMAKE_CXX_STANDARD 17)
endif()


if(POLICY CMP0135)
  cmake_policy(SET CMP0135 NEW)
endif()

# To ease enablement with Python packaging
if(DEFINED ENV{ELASTIX_USE_OPENCL})
  set(ELASTIX_USE_OPENCL ON CACHE BOOL "Enable OpenCL support in Elastix")
endif()

set(Elastix_LIBRARIES elastix_lib transformix_lib)
if(ELASTIX_USE_OPENCL)
  list(APPEND Elastix_LIBRARIES elxOpenCL)
endif()
set(ELASTIX_BUILD_EXECUTABLE OFF)
set(ELASTIX_BUILD_EXECUTABLE OFF CACHE BOOL "Generate executable or library")
# Avoid LGPL code and ANN shared library
if(NOT DEFINED USE_KNNGraphAlphaMutualInformationMetric)
  set(USE_KNNGraphAlphaMutualInformationMetric OFF)
  set(USE_KNNGraphAlphaMutualInformationMetric OFF CACHE BOOL "Use KNN metric.  Requires ANN library.")
endif()

if(CMAKE_COMPILER_IS_GNUCXX)
  set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wno-aggressive-loop-optimizations")
endif()

set(CMAKE_POSITION_INDEPENDENT_CODE ON)

if(NOT ITK_SOURCE_DIR)
  find_package(ITK REQUIRED)
endif()

include(FetchContent)

# Set up Elastix build parameters for populate step
option(ELASTIX_BUILD_TESTING OFF)
set(_itk_build_testing ${BUILD_TESTING})
set(BUILD_TESTING ${ELASTIX_BUILD_TESTING})
set(_itk_build_shared ${BUILD_SHARED_LIBS})
set(BUILD_SHARED_LIBS OFF) # Elastix does not support shared libs

# Building Python wheels, disable installation of elastix artifacts
if(SKBUILD)
  option(ELASTIX_NO_INSTALL_RUNTIME_LIBRARIES "Do not install runtime libraries" ON)
  option(ELASTIX_NO_INSTALL_EXECUTABLES "Do not install executables" ON)
  option(ELASTIX_NO_INSTALL_DEVELOPMENT "Do not install development headers and static libraries" ON)
  mark_as_advanced(ELASTIX_NO_INSTALL_EXECUTABLES ELASTIX_NO_INSTALL_RUNTIME_LIBRARIES ELASTIX_NO_INSTALL_DEVELOPMENT)
endif()

if(WASI OR EMSCRIPTEN)
  option(ELASTIX_NO_INSTALL_EXECUTABLES "Do not install executables" ON)
endif()

set(elastix_GIT_REPOSITORY "https://github.com/SuperElastix/elastix.git")
# Branch: WIP-Add-landmark-support-to-library WIP: Add SetMovingPointsByVectorOfCoordinatesByValue 
set(elastix_GIT_TAG "16f8a81d8c2d70f957ac857fdec7f1023253ae18")
FetchContent_Declare(
  elx
  GIT_REPOSITORY ${elastix_GIT_REPOSITORY}
  GIT_TAG ${elastix_GIT_TAG})
FetchContent_GetProperties(elx)
if(NOT elx_POPULATED)
  FetchContent_Populate(elx)
  # Use CMake's FindOpenCL.cmake, which is backend agnostic
  file(REMOVE ${elx_SOURCE_DIR}/CMake/FindOpenCL.cmake)
  if(ELASTIX_USE_OPENCL)
    find_package(OpenCL REQUIRED)
    set(OPENCL_INCLUDE_DIRS ${OpenCL_INCLUDE_DIRS} CACHE PATH "OpenCL include directories")
    set(OPENCL_LIBRARIES ${OpenCL_LIBRARIES} CACHE FILEPATH "OpenCL library")
  endif()
  add_subdirectory(${elx_SOURCE_DIR} ${elx_BINARY_DIR})
endif()
set(Elastix_DIR "${elx_BINARY_DIR}")
find_package(Elastix REQUIRED)
include_directories( ${ELASTIX_INCLUDE_DIRS} )
link_directories( ${ELASTIX_LIBRARY_DIRS} )
#include(${ELASTIX_USE_FILE})
if(ELASTIX_USE_OPENCL)
  add_definitions(-DELASTIX_USE_OPENCL)
endif()

# Reset parameters for ITK remote module build
if (NOT WASI AND NOT EMSCRIPTEN)
  set(BUILD_TESTING ${_itk_build_testing})
  set(BUILD_SHARED_LIBS ${_itk_build_shared})
endif()

if(ITK_WRAP_PYTHON) # Python wrapping is enabled
  get_property(multi_config GLOBAL PROPERTY GENERATOR_IS_MULTI_CONFIG)
  if(multi_config)
    if(NOT (CMAKE_CONFIGURATION_TYPES STREQUAL "Release"))
      message(WARNING "Python wrapping of ITKElastix is known not to work with RelWithDebInfo configuration. Release is recommended. Your CMAKE_CONFIGURATION_TYPES: ${CMAKE_CONFIGURATION_TYPES}")
    endif()
  else()
    if(NOT (CMAKE_BUILD_TYPE STREQUAL "Release"))
      message(WARNING "Python wrapping of ITKElastix is known not to work with RelWithDebInfo configuration. Release is recommended. Your CMAKE_BUILD_TYPE: ${CMAKE_BUILD_TYPE}")
    endif()
  endif()
endif()

option(ITKELASTIX_BUILD_WASM_EXECUTABLES "Build WASM executables" OFF)

if(NOT ITK_SOURCE_DIR)
  find_package(ITK REQUIRED)
  list(APPEND CMAKE_MODULE_PATH ${ITK_CMAKE_DIR})
  include(ITKModuleExternal)
  if(WASI OR EMSCRIPTEN OR ITKELASTIX_BUILD_WASM_EXECUTABLES)
    set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR})
    add_subdirectory(wasm)
  endif()
else()
  set(ITK_DIR ${CMAKE_BINARY_DIR})
  itk_module_impl()
endif()
