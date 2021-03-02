#==========================================================================
#
#   Copyright NumFOCUS
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
    print('Usage: ' + sys.argv[0] + ' <MovingImage> <TransformParameters> <ResultImage>')
    sys.exit(1)

moving_filename = sys.argv[1]
transform_parameters_filename = sys.argv[2]
result_filename = sys.argv[3]

moving = itk.imread(moving_filename, itk.F)

parameters = itk.ParameterObject.New()
parameters.ReadParameterFile(transform_parameters_filename)
print(parameters)

# Object oriented interface
ImageType = itk.Image[itk.F, 3]
transformix = itk.TransformixFilter[ImageType].New()
transformix.SetMovingImage(moving)
transformix.SetLogToConsole(True)
transformix.SetTransformParameterObject(parameters)
transformix.UpdateLargestPossibleRegion()
result = transformix.GetOutput()
itk.imwrite(result, result_filename)

# Functional interface
result = itk.transformix_filter(moving, parameters, log_to_console=True)
itk.imwrite(result, result_filename)

deformation_field = itk.transformix_deformation_field(moving, parameters, log_to_console=True)
# Fails per:
#  https://github.com/InsightSoftwareConsortium/ITKElastix/issues/108j
# jacobian = itk.transformix_jacobian(moving, parameters, log_to_console=True)
