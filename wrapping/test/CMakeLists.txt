itk_python_expression_add_test(NAME itkElastixRegistrationMethodPythonTest
  EXPRESSION "filt = itk.ElastixRegistrationMethod.New()")
itk_python_expression_add_test(NAME itkTransformixFilterPythonTest
  EXPRESSION "filt = itk.TransformixFilter.New()")
itk_python_expression_add_test(NAME elxParameterObjectPythonTest
  EXPRESSION "parameter_object = itk.ParameterObject.New()")
