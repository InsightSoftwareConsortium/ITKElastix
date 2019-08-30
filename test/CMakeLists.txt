itk_module_test()

set(ElastixTests
  itkElastixFilterTest.cxx
  )

CreateTestDriver(Elastix "${Elastix-Test_LIBRARIES}" "${ElastixTests}")

itk_add_test(NAME itkElastixFilterTest
  COMMAND ElastixTestDriver
    --compare
    ${ITK_TEST_OUTPUT_DIR}/itkElastixFilterTestOutput.mha
    DATA{Baseline/itkElastixFilterTestOutput.mha}
  itkElastixFilterTest
    ${ITK_TEST_OUTPUT_DIR}/itkElastixFilterTestOutput.mha
  )
