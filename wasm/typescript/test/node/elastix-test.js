import test from 'ava'
import path from 'path'

import { elastixWasmNode } from '../../dist/bundles/elastix-node.js'
import { readImageLocalFile } from 'itk-wasm'

const testDataInputDirectory = path.resolve('..', 'test', 'data', 'input')

test('Default 3D registration', async t => {
  const fixedImage = await readImageLocalFile(path.join(testDataInputDirectory, 'CT_3D_lung_fixed.iwi.cbor'))
  const movingImage = await readImageLocalFile(path.join(testDataInputDirectory, 'CT_3D_lung_moving.iwi.cbor'))
  // Post: https://github.com/InsightSoftwareConsortium/itk-wasm/pull/828
  // const fixedImage = path.join(testDataInputDirectory, 'CT_3D_lung_fixed.iwi.cbor')
  // const movingImage = path.join(testDataInputDirectory, 'CT_3D_lung_moving.iwi.cbor')
  const { result } = await elastixWasmNode({ fixed: fixedImage, moving: movingImage })

  t.is(result.imageType.dimension, 3)
  t.is(result.imageType.componentType, 'int16')
  t.is(result.size[0], 115)
  t.is(result.size[1], 157)
  t.is(result.size[2], 129)
})