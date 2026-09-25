cmake_minimum_required(VERSION 3.24.2)
project(ElastixWasm)

set(CMAKE_CXX_STANDARD 20)

# Link the wasm modules one at a time. The link-time-optimized links of the elastix and transformix
# modules each need several gigabytes of memory, and linking them concurrently exhausts the memory of
# CI runners. Only the Ninja generator honors job pools; others ignore this.
set_property(GLOBAL PROPERTY JOB_POOLS link_pool=1)
set(CMAKE_JOB_POOL_LINK link_pool)

if(EMSCRIPTEN)
  # Transforms are passed through memory in the browser, so no transform file IO is needed.
  set(io_components)
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

add_test(NAME elastix-wasm-2d-initial-transform-test
  COMMAND elastix
    ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_single.json
    ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_registered_initial.iwi.cbor
    ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_initial.h5
    ${CMAKE_CURRENT_BINARY_DIR}/CT_2D_head_initial.json
    -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_fixed.iwi.cbor
    -m ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_moving.iwi.cbor
    -i ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_2D_head_translation.h5
  )

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
    ${CMAKE_CURRENT_BINARY_DIR}/CT_3D_lung_transformix.iwi.cbor
    -p ${CMAKE_CURRENT_BINARY_DIR}/CT_3D_lung.json
  )
set_tests_properties(transformix-wasm-test PROPERTIES DEPENDS elastix-wasm-test)

add_test(NAME transformix-wasm-transform-test
  COMMAND transformix
    ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/CT_3D_lung_moving.iwi.cbor
    ${CMAKE_CURRENT_BINARY_DIR}/CT_3D_lung_transformix_transform.iwi.cbor
    -t ${CMAKE_CURRENT_BINARY_DIR}/CT_3D_lung.h5
  )
set_tests_properties(transformix-wasm-transform-test PROPERTIES DEPENDS elastix-wasm-test)

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

# The TOML parameter file format is selected by the .toml file extension. The TOML files mirror the
# legacy text files, so reading either format produces the same parameter object.
add_test(NAME read-parameter-files-toml-test
  COMMAND read-parameter-files
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_single_toml.json
    -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_Affine.toml
  )

add_test(NAME read-parameter-files-toml-matches-txt-test
  COMMAND ${CMAKE_COMMAND} -E compare_files
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_single.json
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_single_toml.json
  )
set_tests_properties(read-parameter-files-toml-matches-txt-test PROPERTIES
  DEPENDS "read-parameter-files-test;read-parameter-files-toml-test")

add_test(NAME read-parameter-files-mixed-format-test
  COMMAND read-parameter-files
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_multiple_mixed_format.json
    -f ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_Translation.toml
       ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_Affine.txt
  )

add_test(NAME read-parameter-files-mixed-format-matches-txt-test
  COMMAND ${CMAKE_COMMAND} -E compare_files
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_multiple.json
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_multiple_mixed_format.json
  )
set_tests_properties(read-parameter-files-mixed-format-matches-txt-test PROPERTIES
  DEPENDS "read-parameter-files-multiple-test;read-parameter-files-mixed-format-test")

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

add_test(NAME write-parameter-files-toml-test
  COMMAND write-parameter-files
    ${CMAKE_CURRENT_SOURCE_DIR}/test/data/input/parameters_multiple.json
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_Translation.toml
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_Affine.toml
  )

# Round trip: the written TOML files read back to the parameter object they were written from.
add_test(NAME read-parameter-files-toml-round-trip-test
  COMMAND read-parameter-files
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_multiple_toml_round_trip.json
    -f ${CMAKE_CURRENT_BINARY_DIR}/parameters_Translation.toml
       ${CMAKE_CURRENT_BINARY_DIR}/parameters_Affine.toml
  )
set_tests_properties(read-parameter-files-toml-round-trip-test PROPERTIES DEPENDS write-parameter-files-toml-test)

add_test(NAME read-parameter-files-toml-round-trip-matches-test
  COMMAND ${CMAKE_COMMAND} -E compare_files
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_multiple.json
    ${CMAKE_CURRENT_BINARY_DIR}/parameters_multiple_toml_round_trip.json
  )
set_tests_properties(read-parameter-files-toml-round-trip-matches-test PROPERTIES
  DEPENDS "read-parameter-files-multiple-test;read-parameter-files-toml-round-trip-test")

add_test(NAME default-parameter-map-test
  COMMAND default-parameter-map
    affine
    ${CMAKE_CURRENT_BINARY_DIR}/affine_default_parameters.json
  )
