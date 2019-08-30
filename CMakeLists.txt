cmake_minimum_required(VERSION 3.10.2)
project(Elastix)

include(FetchContent)

set(elastix_GIT_REPOSITORY "https://github.com/SuperElastix/elastix.git")
set(elastix_GIT_TAG "701bca59dc7e0fc71d24e4f7ba77166e1d47a88d")
FetchContent_Declare(
  elastix_fetch
  GIT_REPOSITORY ${elastix_GIT_REPOSITORY}
  GIT_TAG ${elastix_GIT_TAG})
FetchContent_GetProperties(elastix_fetch)
if(NOT elastix_fetch_POPULATED)
  FetchContent_Populate(elastix_fetch)
  add_subdirectory(${elastix_fetch_SOURCE_DIR} ${elastix_fetch_SOURCE_DIR})
endif()

if(NOT ITK_SOURCE_DIR)
  find_package(ITK REQUIRED)
  list(APPEND CMAKE_MODULE_PATH ${ITK_CMAKE_DIR})
  include(ITKModuleExternal)
else()
  set(ITK_DIR ${CMAKE_BINARY_DIR})
  itk_module_impl()
endif()
