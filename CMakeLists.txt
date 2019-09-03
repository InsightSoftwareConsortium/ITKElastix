cmake_minimum_required(VERSION 3.10.2)
project(Elastix)

set(Elastix_LIBRARIES elastix transformix)
set(ELASTIX_BUILD_EXECUTABLE OFF CACHE BOOL "Generate executable or library")


if(NOT ITK_SOURCE_DIR)
  find_package(ITK REQUIRED)
endif()

include(FetchContent)

set(elastix_GIT_REPOSITORY "https://github.com/SuperElastix/elastix.git")
set(elastix_GIT_TAG "87758acc566e050973c4a92a062ba4e8feaf128d")
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

if(NOT ITK_SOURCE_DIR)
  find_package(ITK REQUIRED)
  list(APPEND CMAKE_MODULE_PATH ${ITK_CMAKE_DIR})
  include(ITKModuleExternal)
else()
  set(ITK_DIR ${CMAKE_BINARY_DIR})
  itk_module_impl()
endif()
