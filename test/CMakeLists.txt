itk_module_test()

set(ElastixTests
  itkElastixRegistrationMethodTest.cxx
  )

CreateTestDriver(Elastix "${Elastix-Test_LIBRARIES}" "${ElastixTests}")

itk_add_test(NAME itkElastixRegistrationMethodTest
  COMMAND ElastixTestDriver
    #--compare
    #${ITK_TEST_OUTPUT_DIR}/itkElastixRegistrationMethodTestOutput.mha
    #DATA{Baseline/itkElastixRegistrationMethodTestOutput.mha}
  itkElastixRegistrationMethodTest
    ${CMAKE_CURRENT_SOURCE_DIR}/Input/CT_3D_lung_fixed.mha
    ${CMAKE_CURRENT_SOURCE_DIR}/Input/CT_3D_lung_moving.mha
    ${ITK_TEST_OUTPUT_DIR}/itkElastixRegistrationMethodTestOutput.mha
  )
