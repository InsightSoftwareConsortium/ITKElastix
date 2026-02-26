# ==========================================================================
#
#   Copyright NumFOCUS
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#          https://www.apache.org/licenses/LICENSE-2.0.txt
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.
#
# ==========================================================================*/

import itk
import sys

if len(sys.argv) < 4:
    print("Usage: " + sys.argv[0] + " <FixedImage> <MovingImage> <ResultImage>")
    sys.exit(1)

fixed_filename = sys.argv[1]
moving_filename = sys.argv[2]
result_filename = sys.argv[3]

fixed = itk.imread(fixed_filename, itk.F)
moving = itk.imread(moving_filename, itk.F)

# Create a parameter dict with Python-native types (TOML-style).
# This tests that elastix_registration_method accepts a dict
# as the parameter_object argument.
parameter_dict = {
    "AutomaticScalesEstimation": True,
    "AutomaticTransformInitialization": True,
    "ImageSampler": "Full",
    "MaximumNumberOfIterations": 8,
    "Metric": "AdvancedNormalizedCorrelation",
    "Optimizer": "AdaptiveStochasticGradientDescent",
    "Registration": "MultiResolutionRegistration",
    "ResultImageFormat": "mha",
    "Transform": "TranslationTransform",
}

registered, transform = itk.elastix_registration_method(
    fixed, moving, parameter_object=parameter_dict
)

assert registered is not None
assert transform is not None
assert transform.GetNumberOfParameterMaps() >= 1

itk.imwrite(itk.down_cast(registered), result_filename)
print(transform)
print("elastix_registration_method with dict parameter_object succeeded.")
