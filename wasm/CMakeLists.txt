cmake_minimum_required(VERSION 3.16)
project(ElastixWasm)

set(CMAKE_CXX_STANDARD 17)

if(EMSCRIPTEN)
  set(io_components
    )
elseif(WASI)
  set(io_components
    ITKIOMeta
    )
else()
  set(io_components
    ITKImageIO
    )
endif()
find_package(ITK REQUIRED
  COMPONENTS
    ${io_components}
    WebAssemblyInterface
    Elastix
  )
include(${ITK_USE_FILE})

add_executable(elastix-wasm ElastixWasm.cxx)
target_link_libraries(elastix-wasm PUBLIC ${ITK_LIBRARIES})

# enable_testing()

# itk_add_test(NAME itkElastixRegistrationMethodTest
#   COMMAND ElastixTestDriver
#   --compareNumberOfPixelsTolerance 25
#   --compare
#     ${ITK_TEST_OUTPUT_DIR}/itkElastixRegistrationMethodTestOutput.mha
#     DATA{Baseline/itkElastixRegistrationMethodTestOutput.mha}
#   itkElastixRegistrationMethodTest
#     DATA{Input/CT_3D_lung_fixed.mha}
#     DATA{Input/CT_3D_lung_moving.mha}
#     ${ITK_TEST_OUTPUT_DIR}/itkElastixRegistrationMethodTestOutput.mha
#   )
