cmake_minimum_required(VERSION 3.10.2)
project(Elastix)

set(Elastix_LIBRARIES elastix transformix)
set(ELASTIX_BUILD_EXECUTABLE OFF CACHE BOOL "Generate executable or library")
# Avoid LGPL code
set(USE_KNNGraphAlphaMutualInformationMetric OFF)

if(CMAKE_COMPILER_IS_GNUCXX AND
  ("${CMAKE_CXX_COMPILER_VERSION}" VERSION_EQUAL "4.8") OR
  ("${CMAKE_CXX_COMPILER_VERSION}" VERSION_GREATER "4.8" AND "${CMAKE_CXX_COMPILER_VERSION}" VERSION_LESS "5.0") )
  set(ELASTIX_USE_OPENMP OFF CACHE BOOL "Use OpenMP in elastix")
endif()

set(CMAKE_POSITION_INDEPENDENT_CODE ON)

if(NOT ITK_SOURCE_DIR)
  find_package(ITK REQUIRED)
endif()

include(FetchContent)

set(_itk_build_testing ${BUILD_TESTING})
set(BUILD_TESTING OFF)
set(elastix_GIT_REPOSITORY "https://github.com/thewtex/elastix.git")
set(elastix_GIT_TAG "e4486d83d53c2836a1d442eb3fa83c3be8de293f")
FetchContent_Declare(
  elastix_fetch
  GIT_REPOSITORY ${elastix_GIT_REPOSITORY}
  GIT_TAG ${elastix_GIT_TAG})
FetchContent_GetProperties(elastix_fetch)
if(NOT elastix_fetch_POPULATED)
  FetchContent_Populate(elastix_fetch)
  add_subdirectory(${elastix_fetch_SOURCE_DIR} ${elastix_fetch_BINARY_DIR})
endif()
set(Elastix_DIR "${elastix_fetch_BINARY_DIR}")
find_package(Elastix REQUIRED)
include_directories( ${ELASTIX_INCLUDE_DIRS} )
link_directories( ${ELASTIX_LIBRARY_DIRS} )
#include(${ELASTIX_USE_FILE})
if(ELASTIX_USE_OPENMP)
  find_package(OpenMP QUIET)
  if(OPENMP_FOUND)
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${OpenMP_C_FLAGS}")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} ${OpenMP_CXX_FLAGS}")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} ${OpenMP_EXE_LINKER_FLAGS}")
    set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} ${OpenMP_SHARED_LINKER_FLAGS}")
    set(CMAKE_STATIC_LINKER_FLAGS "${CMAKE_STATIC_LINKER_FLAGS} ${OpenMP_STATIC_LINKER_FLAGS}")
    add_definitions(-DELASTIX_USE_OPENMP)
  endif()
endif()
set(BUILD_TESTING ${_itk_build_testing})

if(NOT ITK_SOURCE_DIR)
  find_package(ITK REQUIRED)
  list(APPEND CMAKE_MODULE_PATH ${ITK_CMAKE_DIR})
  include(ITKModuleExternal)
else()
  set(ITK_DIR ${CMAKE_BINARY_DIR})
  itk_module_impl()
endif()
