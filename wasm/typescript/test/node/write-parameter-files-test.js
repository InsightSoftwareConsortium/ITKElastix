import test from 'ava'
import path from 'path'
import fs from 'fs'

import { writeParameterFilesNode } from '../../dist/bundles/elastix-node.js'

const testDataInputDirectory = path.resolve('..', 'test', 'data', 'input')
const testDataOutputDirectory = path.resolve('..', 'test', 'data', 'output')
try {
  fs.mkdirSync(testDataOutputDirectory)
} catch (e) {
  if (e.code !== 'EEXIST') {
    throw e
  }
}

test('Write parameter files', async t => {
  const parametersMultipleFile = path.join(testDataInputDirectory, 'parameters_multiple.json')
  const parametersMultiple = JSON.parse(fs.readFileSync(parametersMultipleFile))
  const translationFile = path.join(testDataOutputDirectory, 'parameters_Translation.txt')
  const affineFile = path.join(testDataOutputDirectory, 'parameters_Affine.txt')

  await writeParameterFilesNode(parametersMultiple, { parameterFilesPath: [translationFile, affineFile] })
  t.pass()
})