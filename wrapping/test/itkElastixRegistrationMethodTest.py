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
    print('Usage: ' + sys.argv[0] + ' <FixedImage> <MovingImage> <ResultImage>')
    sys.exit(1)

fixed_filename = sys.argv[1]
moving_filename = sys.argv[2]
result_filename = sys.argv[3]

fixed = itk.imread(fixed_filename, itk.F)
moving = itk.imread(moving_filename, itk.F)

result = itk.elastix_registration_method(fixed, moving)

itk.imwrite(result, result_filename)
