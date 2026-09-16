/*=========================================================================
 *
 *  Copyright NumFOCUS
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *         https://www.apache.org/licenses/LICENSE-2.0.txt
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 *=========================================================================*/
#ifndef itkElastixWasmReadInputTransform_h
#define itkElastixWasmReadInputTransform_h

// Read an ITK-Wasm INPUT_TRANSFORM pipeline argument -- a single transform, a transform chain, or a
// composite transform -- into the abstract itk::Transform<double, Dim, Dim> base that
// itk::ElastixRegistrationMethod::SetExternalInitialTransform() and
// itk::TransformixFilter::SetExternalTransform() accept.
//
// itk::wasm::InputTransform<T> cannot read a generic transform: it hard-codes a concrete T and, on the
// in-memory path, copies the JSON's parameter array into that T after checking only precision and
// dimension, never the parameterization. Instead, each concrete transform is reconstructed by name via
// the ITK object factory, exactly as itkWasmTransformToTransformFilter does for composite components,
// and returned upcast to the base.
//
// Multi-transform lists are composed into an itk::CompositeTransform. Following the itk-wasm
// TransformList serialization convention, a Composite entry is a marker that carries no parameters of
// its own (the components follow it in the list), so Composite entries are skipped and every
// non-composite entry becomes a component. Components are added in list order [T0, T1, ..., TN-1] and
// itk::CompositeTransform applies the queue in reverse, T0(T1(...TN-1(x))), matching what
// itkWasmTransformToTransformFilter produces for the same composite JSON.
//
// Two transport paths:
//   * --memory-io (TypeScript / Python bindings): the transform arrives in the wasm memory store; the
//     CLI argument is its store index.
//   * filesystem (native / WASI CTest): the argument is a transform file path read with the ITK
//     transform reader. For a file holding a composite transform, ITK's reader returns the
//     fully-populated CompositeTransform as the list front (its components repeat behind it), so the
//     front is used directly; a multi-transform file without a composite wrapper is composed in list
//     order as above.
//
// The math is always performed at double precision, which is lossless for float32 and float64 inputs.
//
// Adapted from ITK-Wasm packages/downsample/resampleReadInputTransform.h.

#include <algorithm>
#include <cstdlib>
#include <string>
#include <vector>

#include "itkCompositeTransform.h"
#include "itkMacro.h"
#include "itkPipeline.h"
#include "itkTransform.h"

#ifndef ITK_WASM_NO_FILESYSTEM_IO
#  include "itkTransformFileReader.h"
#endif
#ifndef ITK_WASM_NO_MEMORY_IO
#  include "itkWasmExports.h"
#  include "itkTransformJSON.h"
#  include "itktransformParameterizationString.h"
#  include "itkTransformFactoryBase.h"
#  include "itkObjectFactoryBase.h"

#  include "glaze/glaze.hpp"
#endif

namespace
{

#ifndef ITK_WASM_NO_MEMORY_IO
// Reconstruct one non-composite TransformListJSON entry into a concrete, double-precision transform,
// returned upcast to the abstract itk::Transform base. The concrete type is built by name via the ITK
// object factory; the parameter arrays are copied out of the wasm memory store at the addresses the
// JSON encodes, sized to the entry's own parameter counts.
template <unsigned int VDimension>
typename itk::Transform<double, VDimension, VDimension>::Pointer
reconstructTransformEntry(const itk::TransformJSON & transformJSON)
{
  using TransformType = itk::Transform<double, VDimension, VDimension>;

  if (transformJSON.transformType.inputDimension != VDimension ||
      transformJSON.transformType.outputDimension != VDimension)
  {
    itkGenericExceptionMacro(<< "The input transform dimension does not match the image dimension.");
  }

  // Construct the concrete, double-precision transform by name via the ITK object factory. The factory
  // is populated as a side effect of GetFactory().
  const std::string typeString = itk::transformParameterizationString(transformJSON.transformType) +
                                 "Transform_double_" + std::to_string(VDimension) + "_" + std::to_string(VDimension);
  itk::TransformFactoryBase::GetFactory();
  itk::LightObject::Pointer       instance = itk::ObjectFactoryBase::CreateInstance(typeString.c_str());
  typename TransformType::Pointer transform = dynamic_cast<TransformType *>(instance.GetPointer());
  if (transform.IsNull())
  {
    itkGenericExceptionMacro(<< "Could not construct the input transform type: " << typeString);
  }
  instance->UnRegister(); // correct the extra reference from CreateInstance()

  // The JSON encodes the parameter arrays as wasm memory addresses: "data:application/vnd.itk.address,0:<ptr>".
  constexpr std::string::size_type addressPrefixLength = 35;

  using FixedParametersType = typename TransformType::FixedParametersType;
  using ParametersType = typename TransformType::ParametersType;

  // Fixed parameters are stored at double precision (itk::Transform::FixedParametersValueType is double).
  // Set first: for a B-spline they define the grid, and hence the number of parameters.
  if (transformJSON.numberOfFixedParameters > 0)
  {
    const double * fixedParametersPtr = reinterpret_cast<const double *>(
      std::strtoull(transformJSON.fixedParameters.substr(addressPrefixLength).c_str(), nullptr, 10));
    FixedParametersType fixedParameters(transformJSON.numberOfFixedParameters);
    std::copy(
      fixedParametersPtr, fixedParametersPtr + transformJSON.numberOfFixedParameters, fixedParameters.data_block());
    transform->SetFixedParameters(fixedParameters);
  }

  // Parameters are stored at the transform's own precision; cast into a double buffer so the
  // double-precision transform receives them losslessly whether the source is float32 or float64.
  const std::size_t numberOfParameters = static_cast<std::size_t>(transformJSON.numberOfParameters);
  if (numberOfParameters > 0)
  {
    ParametersType    parameters(numberOfParameters);
    const std::string parametersAddress = transformJSON.parameters.substr(addressPrefixLength);
    if (transformJSON.transformType.parametersValueType == itk::JSONFloatTypesEnum::float32)
    {
      const float * source = reinterpret_cast<const float *>(std::strtoull(parametersAddress.c_str(), nullptr, 10));
      for (std::size_t ii = 0; ii < numberOfParameters; ++ii)
      {
        parameters[ii] = static_cast<double>(source[ii]);
      }
    }
    else
    {
      const double * source = reinterpret_cast<const double *>(std::strtoull(parametersAddress.c_str(), nullptr, 10));
      for (std::size_t ii = 0; ii < numberOfParameters; ++ii)
      {
        parameters[ii] = source[ii];
      }
    }
    if (parameters.Size() != transform->GetNumberOfParameters())
    {
      itkGenericExceptionMacro(<< "The input transform carries " << std::to_string(parameters.Size())
                               << " parameters but " << typeString << " expects "
                               << std::to_string(transform->GetNumberOfParameters()) << ".");
    }
    transform->SetParametersByValue(parameters);
  }

  return transform;
}
#endif // !ITK_WASM_NO_MEMORY_IO

template <unsigned int VDimension>
typename itk::Transform<double, VDimension, VDimension>::Pointer
readInputTransform(const std::string & transformArg)
{
  using TransformType = itk::Transform<double, VDimension, VDimension>;
  using CompositeTransformType = itk::CompositeTransform<double, VDimension>;

  if (transformArg.empty())
  {
    itkGenericExceptionMacro(<< "The input transform argument is empty.");
  }

  if (itk::wasm::Pipeline::get_use_memory_io())
  {
#ifndef ITK_WASM_NO_MEMORY_IO
    // The transform is in the wasm memory store; the argument is its index.
    const unsigned int  index = static_cast<unsigned int>(std::stoi(transformArg));
    const std::string & json = itk::wasm::getMemoryStoreInputJSON(0, index);

    auto deserialized = glz::read_json<itk::TransformListJSON>(json);
    if (!deserialized)
    {
      itkGenericExceptionMacro(<< "Failed to parse the input transform JSON: "
                               << glz::format_error(deserialized, json));
    }
    const itk::TransformListJSON transformListJSON = deserialized.value();
    if (transformListJSON.empty())
    {
      itkGenericExceptionMacro(<< "The input transform list is empty.");
    }

    // Composite entries are markers with no parameters of their own -- their components follow in the
    // list -- so skip them and reconstruct every non-composite entry as a component.
    std::vector<typename TransformType::Pointer> components;
    for (const auto & transformJSON : transformListJSON)
    {
      if (transformJSON.transformType.transformParameterization == itk::JSONTransformParameterizationEnum::Composite)
      {
        continue;
      }
      components.push_back(reconstructTransformEntry<VDimension>(transformJSON));
    }
    if (components.empty())
    {
      itkGenericExceptionMacro(<< "The input composite transform list contains no component transforms.");
    }
    if (components.size() == 1)
    {
      return components.front();
    }

    auto compositeTransform = CompositeTransformType::New();
    for (const auto & component : components)
    {
      compositeTransform->AddTransform(component);
    }
    return compositeTransform.GetPointer();
#else
    itkGenericExceptionMacro(<< "Memory IO support was not compiled into this pipeline.");
#endif
  }

#ifndef ITK_WASM_NO_FILESYSTEM_IO
  // Filesystem path: read any parameterization generically into the base, at double precision.
  using ReaderType = itk::TransformFileReaderTemplate<double>;
  auto reader = ReaderType::New();
  reader->SetFileName(transformArg);
  reader->Update();
  const auto transformList = reader->GetTransformList();
  if (transformList == nullptr || transformList->empty())
  {
    itkGenericExceptionMacro(<< "No transform found in the input transform file.");
  }

  // A file holding a composite transform is returned by ITK's reader as the fully-populated
  // CompositeTransform at the list front, with its components repeated behind it -- use the front directly.
  auto * frontComposite = dynamic_cast<CompositeTransformType *>(transformList->front().GetPointer());
  if (frontComposite != nullptr)
  {
    return frontComposite;
  }

  if (transformList->size() == 1)
  {
    typename TransformType::Pointer transform = dynamic_cast<TransformType *>(transformList->front().GetPointer());
    if (transform.IsNull())
    {
      itkGenericExceptionMacro(<< "The input transform dimension or scalar type is not supported.");
    }
    return transform;
  }

  // Multiple independent transforms without a composite wrapper: compose them in list order, matching
  // the in-memory chain semantics above.
  auto compositeTransform = CompositeTransformType::New();
  for (const auto & entry : *transformList)
  {
    auto * component = dynamic_cast<TransformType *>(entry.GetPointer());
    if (component == nullptr)
    {
      itkGenericExceptionMacro(<< "The input transform dimension or scalar type is not supported.");
    }
    compositeTransform->AddTransform(component);
  }
  return compositeTransform.GetPointer();
#else
  itkGenericExceptionMacro(<< "Filesystem IO support was not compiled into this pipeline.");
#endif
}

} // namespace

#endif // itkElastixWasmReadInputTransform_h
