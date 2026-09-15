cmake_minimum_required(VERSION 3.16)
project(ElastixWasm)

set(CMAKE_CXX_STANDARD 17)

if(EMSCRIPTEN)
  set(io_components
    )
elseif(WASI)
  set(io_components
    ITKIOMeta
    ITKIOTransformHDF5
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

add_executable(transformix transformix-wasm.cxx)
target_link_libraries(transformix PUBLIC ${ITK_LIBRARIES})

add_executable(read-parameter-files read-parameter-files.cxx)
target_link_libraries(read-parameter-files PUBLIC ${ITK_LIBRARIES})

add_executable(write-parameter-files write-parameter-files.cxx)
target_link_libraries(write-parameter-files PUBLIC ${ITK_LIBRARIES})

add_executable(default-parameter-map default-parameter-map.cxx)
target_link_libraries(default-parameter-map PUBLIC ${ITK_LIBRARIES})


enable_testing()

add_test(NAME elastix-wasm-test
  COMMAND elastix
    ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_single.json
    ${CMAKE_CURRENT_BINARY_DIR}/CT_3D_lung_registered.iwi.cbor
    ${CMAKE_CURRENT_BINARY_DIR}/CT_3D_lung.h5
    ${CMAKE_CURRENT_BINARY_DIR}/CT_3D_lung.json
    -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_3D_lung_fixed.iwi.cbor
    -m ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_3D_lung_moving.iwi.cbor
  )

add_test(NAME elastix-wasm-2d-test
  COMMAND elastix
    ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_single.json
    ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_registered.iwi.cbor
    ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head.h5
    ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head.json
    -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_fixed.iwi.cbor
    -m ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_moving.iwi.cbor
  )

#add_test(NAME elastix-wasm-2d-initial-transform-test
  #COMMAND elastix
    #${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_single.json
    #${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_registered_initial.iwi.cbor
    #${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_initial.h5
    #${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_initial.json
    #-f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_fixed.iwi.cbor
    #-m ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_moving.iwi.cbor
    #-i ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_translation.h5
  #)

add_test(NAME elastix-wasm-2d-initial-transform-parameter-object-test
  COMMAND elastix
    ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_single.json
    ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_registered_initial_transform_parameter_object.iwi.cbor
    ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_initial_transform_parameter_object.h5
    ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_initial_transform_parameter_object.json
    -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_fixed.iwi.cbor
    -m ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_moving.iwi.cbor
    -t ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_translation.json
  )

add_test(NAME elastix-wasm-2d-multiple-test
  COMMAND elastix
    ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_multiple.json
    ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_multiple_registered.iwi.cbor
    ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_multiple.h5
    ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_multiple.json
    -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_fixed.iwi.cbor
    -m ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_moving.iwi.cbor
  )

add_test(NAME transformix-wasm-test
  COMMAND transformix
    ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_3D_lung_moving.iwi.cbor
    ${CMAKE_CURRENT_BINARY_DIR}/CT_3D_lung.json
    ${CMAKE_CURRENT_BINARY_DIR}/CT_3D_lung_transformix.iwi.cbor
  )
set_tests_properties(transformix-wasm-test PROPERTIES DEPENDS elastix-wasm-test)

# add_test(NAME elastix-wasm-2d-test
#   COMMAND elastix
#     ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_single.json
#     ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_registered.iwi.cbor
#     ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head.h5
#     ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head.json
#     -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_fixed.iwi.cbor
#     -m ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_moving.iwi.cbor
#   )

add_test(NAME read-parameter-files-test
  COMMAND read-parameter-files
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_single.json
    -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_Affine.txt
  )

add_test(NAME read-parameter-files-multiple-test
  COMMAND read-parameter-files
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_multiple.json
    -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_Translation.txt
       ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_Affine.txt
  )

add_test(NAME write-parameter-files-test
  COMMAND write-parameter-files
    ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_single.json
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_Affine.txt
  )

add_test(NAME write-parameter-files-multiple-test
  COMMAND write-parameter-files
    ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_multiple.json
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_Translation.txt
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_Affine.txt
  )

add_test(NAME default-parameter-map-test
  COMMAND default-parameter-map
    affine
    ${CMAKE_CURRENT_BINARY_DIR}/affine_default_parameters.json
  )
