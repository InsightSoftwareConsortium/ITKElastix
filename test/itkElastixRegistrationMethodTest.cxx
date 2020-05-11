/*=========================================================================
 *
 *  Copyright NumFOCUS
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0.txt
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 *=========================================================================*/

#include "itkElastixRegistrationMethod.h"
#include "itkTransformixFilter.h"

#include "itkCommand.h"
#include "itkImageFileReader.h"
#include "itkImageFileWriter.h"
#include "itkTestingMacros.h"

namespace
{
class ShowProgress : public itk::Command
{
public:
  itkNewMacro(ShowProgress);

  void
  Execute(itk::Object * caller, const itk::EventObject & event) override
  {
    Execute((const itk::Object *)caller, event);
  }

  void
  Execute(const itk::Object * caller, const itk::EventObject & event) override
  {
    if (!itk::ProgressEvent().CheckEvent(&event))
    {
      return;
    }
    const auto * processObject = dynamic_cast<const itk::ProcessObject *>(caller);
    if (!processObject)
    {
      return;
    }
    std::cout << " " << processObject->GetProgress();
  }
};
} // namespace

int
itkElastixRegistrationMethodTest(int argc, char * argv[])
{
  if (argc < 4)
  {
    std::cerr << "Missing parameters." << std::endl;
    std::cerr << "Usage: " << itkNameOfTestExecutableMacro(argv);
    std::cerr << " fixedImage movingImage resultImage";
    std::cerr << std::endl;
    return EXIT_FAILURE;
  }
  const char * fixedImageFileName = argv[1];
  const char * movingImageFileName = argv[2];
  const char * resultImageFileName = argv[3];

  constexpr unsigned int Dimension = 3;
  using PixelType = float;
  using ImageType = itk::Image<PixelType, Dimension>;

  using FilterType = itk::ElastixRegistrationMethod<ImageType, ImageType>;
  FilterType::Pointer filter = FilterType::New();

  using ReaderType = itk::ImageFileReader<ImageType>;
  ReaderType::Pointer fixedImageReader = ReaderType::New();
  fixedImageReader->SetFileName(fixedImageFileName);
  fixedImageReader->Update();

  using ReaderType = itk::ImageFileReader<ImageType>;
  ReaderType::Pointer movingImageReader = ReaderType::New();
  movingImageReader->SetFileName(movingImageFileName);
  movingImageReader->Update();

  ShowProgress::Pointer showProgress = ShowProgress::New();
  filter->AddObserver(itk::ProgressEvent(), showProgress);
  filter->SetFixedImage(fixedImageReader->GetOutput());
  filter->SetMovingImage(movingImageReader->GetOutput());

  TEST_EXPECT_EQUAL(filter->GetInput(), filter->GetInput(0));
  std::cout << "\nFixedImage: ";
  filter->GetInput(0)->Print(std::cout);
  std::cout << "\nMovingImage: ";
  filter->GetInput(1)->Print(std::cout);
  std::cout << "\nParameterObject: ";
  filter->GetInput(2)->Print(std::cout);
  TEST_EXPECT_EQUAL(filter->GetNumberOfIndexedInputs(), 3);
  filter->SetLogToConsole(true);

  filter->Update();


  EXERCISE_BASIC_OBJECT_METHODS(filter, ElastixRegistrationMethod, ImageSource);

  using TransformixFilterType = itk::TransformixFilter<ImageType>;
  TransformixFilterType::Pointer transformixFilter = TransformixFilterType::New();
  transformixFilter->SetMovingImage(movingImageReader->GetOutput());
  transformixFilter->SetTransformParameterObject(filter->GetTransformParameterObject());

  using WriterType = itk::ImageFileWriter<ImageType>;
  WriterType::Pointer writer = WriterType::New();
  writer->SetFileName(resultImageFileName);

  writer->SetInput(transformixFilter->GetOutput());

  TRY_EXPECT_NO_EXCEPTION(writer->Update());


  std::cout << "Test finished." << std::endl;
  return EXIT_SUCCESS;
}
