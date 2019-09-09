itk_module_test()

set(ElastixTests
  itkElastixFilterTest.cxx
  )

CreateTestDriver(Elastix "${Elastix-Test_LIBRARIES}" "${ElastixTests}")

itk_add_test(NAME itkElastixFilterTest
  COMMAND ElastixTestDriver
    #--compare
    #${ITK_TEST_OUTPUT_DIR}/itkElastixFilterTestOutput.mha
    #DATA{Baseline/itkElastixFilterTestOutput.mha}
  itkElastixFilterTest
    ${CMAKE_CURRENT_SOURCE_DIR}/Input/CT_3D_lung_fixed.mha
    ${CMAKE_CURRENT_SOURCE_DIR}/Input/CT_3D_lung_moving.mha
    ${ITK_TEST_OUTPUT_DIR}/itkElastixFilterTestOutput.mha
  )
