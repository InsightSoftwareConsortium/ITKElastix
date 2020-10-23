itk_python_expression_add_test(NAME elxParameterObjectPythonTest
  EXPRESSION "parameter_object = itk.ParameterObject.New()")
itk_python_add_test(NAME itkElastixRegistrationMethodPythonTest
  COMMAND itkElastixRegistrationMethodTest.py
    DATA{../../test/Input/CT_3D_lung_fixed.mha}
    DATA{../../test/Input/CT_3D_lung_moving.mha}
    ${ITK_TEST_OUTPUT_DIR}/itkElastixRegistrationMethodPythonTestOutput.mha
    ${ITK_TEST_OUTPUT_DIR}/itkElastixRegistrationMethodPythonTestParameters.
    )
itk_python_add_test(NAME itkTransformixFilterPythonTest
  COMMAND itkTransformixFilterTest.py
    DATA{../../test/Input/CT_3D_lung_moving.mha}
    ${CMAKE_CURRENT_SOURCE_DIR}/../../test/Input/transformparameters.3DCT_lung.affine.txt
    ${ITK_TEST_OUTPUT_DIR}/itkTransformixFilterPythonTestOutput.mha
    )
