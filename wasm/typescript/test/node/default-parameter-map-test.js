import test from 'ava'

import { defaultParameterMapNode } from '../../dist/bundles/elastix-node.js'

test('Default affine paramemeter map', async t => {
  const { parameterMap } = await defaultParameterMapNode('affine', { numberOfResolutions: 2 })

  t.is(parameterMap.Optimizer[0], 'AdaptiveStochasticGradientDescent')
  t.is(parameterMap.NumberOfResolutions[0], '2')
})