itk_wrap_module(Elastix)
set(WRAPPER_SWIG_LIBRARY_FILES ${WRAPPER_SWIG_LIBRARY_FILES} "${CMAKE_CURRENT_SOURCE_DIR}/stdParameterMapFileNameVector.i")
itk_auto_load_submodules()
itk_end_wrap_module()
