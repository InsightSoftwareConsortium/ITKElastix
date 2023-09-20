cmake_minimum_required(VERSION 3.16)
project(ElastixWasm)

set(CMAKE_CXX_STANDARD 17)

if(EMSCRIPTEN)
  set(io_components
    ITKTransformIO
    )
elseif(WASI)
  set(io_components
    ITKIOMeta
    ITKTransformIO
    )
else()
  set(io_components
    ITKImageIO
    ITKTransformIO
    )
endif()
find_package(ITK REQUIRED
  COMPONENTS
    ${io_components}
    WebAssemblyInterface
    Elastix
  )
include(${ITK_USE_FILE})

add_executable(elastix elastix-wasm.cxx)
target_link_libraries(elastix PUBLIC ${ITK_LIBRARIES})

add_executable(read-parameter-file read-parameter-file.cxx)
target_link_libraries(read-parameter-file PUBLIC ${ITK_LIBRARIES})

add_executable(write-parameter-file write-parameter-file.cxx)
target_link_libraries(write-parameter-file PUBLIC ${ITK_LIBRARIES})

enable_testing()
add_test(NAME elastix-wasm-test
  COMMAND elastix
    ${CMAKE_CURRENT_BINARY_DIR}/CT_3D_lung_registered.iwi.cbor
    ${CMAKE_CURRENT_BINARY_DIR}/CT_3D_lung.h5
    -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_3D_lung_fixed.iwi.cbor
    -m ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_3D_lung_moving.iwi.cbor
  )

add_test(NAME read-parameter-file-test
  COMMAND read-parameter-file
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_single.json
    -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_Affine.txt
  )

add_test(NAME read-parameter-file-multiple-test
  COMMAND read-parameter-file
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_multiple.json
    -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_Translation.txt
       ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_Affine.txt
  )

add_test(NAME write-parameter-file-test
  COMMAND write-parameter-file
    ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_single.json
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_Affine.txt
  )

add_test(NAME write-parameter-file-multiple-test
  COMMAND write-parameter-file
    ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_multiple.json
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_Translation.txt
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_Affine.txt
  )
