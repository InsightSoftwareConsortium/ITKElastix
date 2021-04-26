itk_wrap_module(Elastix)
set(WRAPPER_SWIG_LIBRARY_FILES ${WRAPPER_SWIG_LIBRARY_FILES} "${CMAKE_CURRENT_SOURCE_DIR}/stdParameterMapFileNameVector.i")
file(READ ${CMAKE_CURRENT_SOURCE_DIR}/transformix_extras.py transformix_extras)
set(ITK_WRAP_PYTHON_LIBRARY_IMPORTS "${transformix_extras}\n${ITK_WRAP_PYTHON_LIBRARY_IMPORTS}")
# See ITK/Wrapping/Generators/SwigInterface/CMakeLists.txt
itk_auto_load_submodules()
itk_end_wrap_module()

set(ITK_WRAP_PYTHON_SNAKE_CONFIG_DIR
  "${WRAPPER_LIBRARY_OUTPUT_DIR}/Generators/Python/itk/Configuration"
)
set(snake_case_config_file
    "${ITK_WRAP_PYTHON_SNAKE_CONFIG_DIR}/${WRAPPER_LIBRARY_NAME}_snake_case.py")
set(snake_overwrite_script "${CMAKE_CURRENT_BINARY_DIR}/snake_overwrite.cmake")
file(GENERATE OUTPUT "${snake_overwrite_script}"
CONTENT "file(WRITE \"${snake_case_config_file}\" \"snake_case_functions = ('elastix_registration_method', 'transformix_filter', 'transformix_deformation_field', 'transformix_jacobian','transformix_pointset',)\")")

add_custom_command(TARGET "${WRAPPER_LIBRARY_NAME}Swig"
  POST_BUILD COMMAND ${CMAKE_COMMAND} -P "${snake_overwrite_script}")
#message(FATAL_ERROR "wrapper-lib-name ${WRAPPER_LIBRARY_NAME} ${snake_case_config_file} ${snake_overwrite_script}")
