/*=========================================================================
 *
 *  Copyright Insight Software Consortium
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
#ifndef itkElastixFilter_h
#define itkElastixFilter_h

#include "itkImageToImageFilter.h"

namespace itk
{

/** \class ElastixFilter
 *
 * \brief Filters a image by iterating over its pixels.
 *
 * Filters a image by iterating over its pixels in a multi-threaded way
 * and {to be completed by the developer}.
 *
 * \ingroup Elastix
 *
 */
template< typename TInputImage, typename TOutputImage >
class ElastixFilter: public ImageToImageFilter< TInputImage, TOutputImage >
{
public:
  ITK_DISALLOW_COPY_AND_ASSIGN(ElastixFilter);

  static constexpr unsigned int InputImageDimension = TInputImage::ImageDimension;
  static constexpr unsigned int OutputImageDimension = TOutputImage::ImageDimension;

  using InputImageType = TInputImage;
  using OutputImageType = TInputImage;
  using InputPixelType = typename InputImageType::PixelType;
  using OutputPixelType = typename OutputImageType::PixelType;

  /** Standard class typedefs. */
  using Self = ElastixFilter< InputImageType, OutputImageType >;
  using Superclass = ImageToImageFilter< InputImageType, OutputImageType >;
  using Pointer = SmartPointer< Self >;
  using ConstPointer = SmartPointer< const Self >;

  /** Run-time type information. */
  itkTypeMacro( ElastixFilter, ImageToImageFilter );

  /** Standard New macro. */
  itkNewMacro( Self );

protected:
  ElastixFilter();
  ~ElastixFilter() override = default;

  void PrintSelf( std::ostream& os, Indent indent ) const override;

  using OutputRegionType = typename OutputImageType::RegionType;

  void DynamicThreadedGenerateData( const OutputRegionType & outputRegion) override;

private:


#ifdef ITK_USE_CONCEPT_CHECKING
  // Add concept checking such as
  // itkConceptMacro( FloatingPointPixel, ( itk::Concept::IsFloatingPoint< typename InputImageType::PixelType > ) );
#endif
};
}

#ifndef ITK_MANUAL_INSTANTIATION
#include "itkElastixFilter.hxx"
#endif

#endif // itkElastixFilter
