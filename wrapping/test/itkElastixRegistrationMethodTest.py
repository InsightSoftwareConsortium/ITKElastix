#==========================================================================
#
#   Copyright Insight Software Consortium
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#          http://www.apache.org/licenses/LICENSE-2.0.txt
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.
#
#==========================================================================*/

import itk
import sys

if len(sys.argv) < 4:
    print('Usage: ' + sys.argv[0] + ' <FixedImage> <MovingImage> <ResultImage> [OutputParameterFilePrefix]')
    sys.exit(1)

fixed_filename = sys.argv[1]
moving_filename = sys.argv[2]
result_filename = sys.argv[3]
output_parameter_files = False
if len(sys.argv) > 4:
    output_parameter_files = True

    prefix = sys.argv[4]

    parameters = itk.ParameterObject.New()

    parameter_map = parameters.GetDefaultParameterMap('translation', 2)
    parameters.WriteParameterFile(parameter_map, prefix + "translation.default.txt")
    parameters.AddParameterMap(parameter_map)
    parameters.SetParameter("ResultImageFormat", "mha")

    parameter_map = parameters.GetDefaultParameterMap('affine', 1)
    parameters.WriteParameterFile(parameter_map, prefix + "affine.default.txt")
    parameters.AddParameterMap(parameter_map)
    parameters.RemoveParameter("WriteResultImage")

    assert(parameters.GetNumberOfParameterMaps() is 2)

    parameter_map = parameters.GetParameterMap(0)
    parameters.WriteParameterFile(parameter_map, prefix + "translation.set.txt")
    parameter_map = parameters.GetParameterMap(1)
    parameters.WriteParameterFile(parameter_map, prefix + "affine.set.txt")

fixed = itk.imread(fixed_filename, itk.F)
moving = itk.imread(moving_filename, itk.F)

if output_parameter_files:
    result = itk.elastix_registration_method(fixed, moving,
                                             parameter_object=parameters)
else:
    result = itk.elastix_registration_method(fixed, moving)

itk.imwrite(result, result_filename)
