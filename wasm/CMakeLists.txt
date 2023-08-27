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

add_executable(elastix ElastixWasm.cxx)
target_link_libraries(elastix PUBLIC ${ITK_LIBRARIES})

enable_testing()
add_test(NAME elastix-wasm-test
  COMMAND elastix
    ${CMAKE_CURRENT_BINARY_DIR}/CT_3D_lung_registered.iwi.cbor
    -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_3D_lung_fixed.iwi.cbor
    -m ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_3D_lung_moving.iwi.cbor
  )
