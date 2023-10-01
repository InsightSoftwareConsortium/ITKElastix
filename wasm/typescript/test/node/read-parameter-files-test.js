import test from 'ava'
import path from 'path'
import fs from 'fs'

import { readParameterFilesNode } from '../../dist/bundles/elastix-node.js'

const testDataInputDirectory = path.resolve('..', 'test', 'data', 'input')

test('Read parameter files', async t => {
  const translationFile = path.join(testDataInputDirectory, 'parameters_Translation.txt')
  const affineFile = path.join(testDataInputDirectory, 'parameters_Affine.txt')

  const { parameterObject } = await readParameterFilesNode({ parameterFiles: [translationFile, affineFile] })

  t.is(parameterObject[0].Transform[0], 'TranslationTransform')
  t.is(parameterObject[1].Transform[0], 'AffineTransform')
})