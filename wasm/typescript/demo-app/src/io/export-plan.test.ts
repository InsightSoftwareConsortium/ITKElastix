// Unit tests for the decisions behind the image exporter. Run with
// `pnpm test:unit`; these stay out of test/ so Playwright never picks them up.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { LPS } from '@fideus-labs/ngff-zarr'
import { strFromU8, unzipSync } from 'fflate'

import type { Transform, TransformList } from 'itk-wasm'

import type { ExportProgress } from './export-types.ts'
import type { LoadedImage } from './load-image.ts'
import {
  EXPORT_LEVEL_CAP,
  canUseDeflateWorkers,
  elastixParameterFileNames,
  elastixParametersText,
  exportScaleFactors,
  inPlaneScaleFactors,
  omeTiffPlaneCount,
  progressReporter,
  registrationOutputs,
  axisMetadataFor,
  resultAddsAnatomicalOrientation,
  resultFilename,
  toWriterError,
  transformFilename,
  transformForFormat,
  XFM_DIMENSION,
  zipTextFiles,
  type AxisMetadata,
} from './export-plan.ts'
import { imageFormatById, TRANSFORM_FORMATS, transformFormatById } from './formats.ts'
import type { ImageShapeInfo } from './scale-select.ts'

/** The fields of a loaded input the plan reads, as a stand-in `LoadedImage`. */
function loaded(name: string, axesOrientations?: Record<string, unknown>): LoadedImage {
  return { name, ngffImage: { axesOrientations } } as unknown as LoadedImage
}

function shape(dims: string[], extents: number[], dtype = 'int16'): ImageShapeInfo {
  return { dims, data: { shape: extents, dtype } }
}

test('registrationOutputs returns the result with both inputs', () => {
  const fixed = loaded('fixed.mha')
  const moving = loaded('moving.mha')
  const result = { image: {}, transform: [], transformParameterObject: [], elapsedMs: 1 } as never
  assert.deepEqual(registrationOutputs({ fixed, moving, result }), { fixed, moving, result })
})

test('registrationOutputs refuses a state without a result or without its inputs', () => {
  const fixed = loaded('fixed.mha')
  const result = { image: {}, transform: [], transformParameterObject: [], elapsedMs: 1 } as never
  assert.throws(() => registrationOutputs({ fixed, moving: loaded('moving.mha') }), /no registration result/)
  assert.throws(() => registrationOutputs({ fixed, result }), /lost its input images/)
  assert.throws(() => registrationOutputs({ result }), /lost its input images/)
})

test('resultFilename names the file after the result in the format extension', () => {
  assert.equal(resultFilename(imageFormatById('ozx')), 'registered.ome.zarr.ozx')
  assert.equal(resultFilename(imageFormatById('ome-tiff')), 'registered.ome.tif')
  assert.equal(resultFilename(imageFormatById('nrrd')), 'registered.nrrd')
  assert.equal(resultFilename(imageFormatById('nii.gz')), 'registered.nii.gz')
  assert.equal(resultFilename(imageFormatById('iwi.cbor')), 'registered.iwi.cbor')
})

test('transformFilename names the transform files after their stem in the format extension', () => {
  assert.equal(transformFilename(transformFormatById('ozx-transform')), 'transform.ome.zarr.ozx')
  assert.equal(transformFilename(transformFormatById('ozx-scene')), 'scene.ome.zarr.ozx')
  assert.equal(transformFilename(transformFormatById('h5')), 'transform.h5')
  assert.equal(transformFilename(transformFormatById('tfm')), 'transform.tfm')
  assert.equal(transformFilename(transformFormatById('iwt.cbor')), 'transform.iwt.cbor')
  assert.equal(transformFilename(transformFormatById('elastix-toml')), 'transform-parameters.zip')
  for (const format of TRANSFORM_FORMATS) {
    assert.ok(transformFilename(format).endsWith(format.extension), `${format.id} keeps its extension`)
  }
  // The two OME-Zarr outputs share an extension, so only the stem tells their downloads apart.
  const ozxNames = TRANSFORM_FORMATS.filter((format) => format.extension === '.ome.zarr.ozx').map(transformFilename)
  assert.equal(new Set(ozxNames).size, ozxNames.length)
})

test('elastixParametersText is the pretty-printed JSON the copy button puts on the clipboard', () => {
  const maps = [{ Transform: ['AffineTransform'], TransformParameters: ['1', '0'] }]
  assert.equal(elastixParametersText(maps), JSON.stringify(maps, null, 2))
  assert.throws(() => elastixParametersText(undefined as never), /no elastix transform parameter maps/)
})

test('elastixParameterFileNames names one TOML file per map the way elastix names its output', () => {
  assert.deepEqual(elastixParameterFileNames(3), [
    'TransformParameters.0.toml',
    'TransformParameters.1.toml',
    'TransformParameters.2.toml',
  ])
  assert.deepEqual(elastixParameterFileNames(1), ['TransformParameters.0.toml'])
  assert.deepEqual(elastixParameterFileNames(0), [])
})

test('zipTextFiles stores each file under its name, in order, as UTF-8', () => {
  const files = [
    { path: 'TransformParameters.0.toml', data: 'Transform = "TranslationTransform"\n' },
    { path: 'TransformParameters.1.toml', data: '# µm\nInitialTransformParameterFileName = "TransformParameters.0.toml"\n' },
  ]
  const entries = unzipSync(zipTextFiles(files))
  assert.deepEqual(Object.keys(entries), files.map(({ path }) => path))
  for (const { path, data } of files) {
    assert.equal(strFromU8(entries[path]), data)
  }
})

/** A stage of an elastix list with the given parameter values; `Composite` markers use it too. */
function stage(parameterization: string, dimension: number, parameters: number[] = [], fixedParameters: number[] = []): Transform {
  return {
    transformType: { transformParameterization: parameterization, parametersValueType: 'float64', inputDimension: dimension, outputDimension: dimension },
    numberOfParameters: parameters.length,
    numberOfFixedParameters: fixedParameters.length,
    name: '',
    inputSpaceName: '',
    outputSpaceName: '',
    parameters: new Float64Array(parameters),
    fixedParameters: new Float64Array(fixedParameters),
  } as unknown as Transform
}

/** elastix's list, header included: affine, rigid, translation, the last applied first. */
function elastixList(dimension: 2 | 3): TransformList {
  return dimension === 2
    ? [
        stage('Composite', 2),
        stage('Affine', 2, [1.1, 0.2, -0.15, 0.95, 2, -3], [12, 30]),
        stage('Euler2D', 2, [0.3, 1.5, -2.5], [40, 25]),
        stage('Translation', 2, [5, -4]),
      ]
    : [
        stage('Composite', 3),
        stage('Affine', 3, [1, 0.1, 0, 0, 0.9, 0.2, -0.1, 0, 1.2, 1, 2, 3], [10, 20, 30]),
        stage('Euler3D', 3, [0.1, -0.2, 0.3, 4, 5, 6], [10, 20, 30]),
        stage('Translation', 3, [-4, 5, -6]),
      ]
}

test('transformForFormat hands every format but xfm the multi-stage list as it is', () => {
  for (const format of TRANSFORM_FORMATS.filter((format) => format.id !== 'xfm')) {
    for (const dimension of [2, 3] as const) {
      const list = elastixList(dimension)
      assert.equal(transformForFormat(format, list), list, `${format.id} ${dimension}D`)
    }
  }
})

test('transformForFormat multiplies the stages out into one 3D affine for xfm', () => {
  const xfm = transformFormatById('xfm')
  for (const dimension of [2, 3] as const) {
    const written = transformForFormat(xfm, elastixList(dimension))
    assert.equal(written.length, 1, `${dimension}D: a single transform`)
    const [affine] = written
    assert.equal(affine!.transformType.transformParameterization, 'Affine', `${dimension}D`)
    assert.equal(affine!.transformType.inputDimension, XFM_DIMENSION, `${dimension}D`)
    assert.equal(affine!.transformType.outputDimension, XFM_DIMENSION, `${dimension}D`)
    assert.equal(affine!.parameters.length, 12, `${dimension}D`)
  }
  // A 2D registration leaves z alone: the matrix's third row and column, and the offset's z, are the identity's.
  const lifted = Array.from(transformForFormat(xfm, elastixList(2))[0]!.parameters as Float64Array)
  assert.deepEqual([lifted[2], lifted[5], lifted[6], lifted[7], lifted[8], lifted[11]], [0, 0, 0, 0, 1, 0])
})

test('transformForFormat says why xfm cannot hold a list with a stage that is not linear', () => {
  const xfm = transformFormatById('xfm')
  assert.throws(
    () => transformForFormat(xfm, [stage('Composite', 2), stage('BSpline', 2, [0, 0], [0, 0]), stage('Translation', 2, [1, 2])]),
    /^Error: MINC XFM holds a single 3D linear transform\. An ITK BSpline transform cannot be multiplied into an affine.*; choose another format$/,
  )
  assert.throws(() => transformForFormat(xfm, [stage('Composite', 2)]), /MINC XFM.*empty transform list/)
})

test('progressReporter forwards the stage, message, and counts, and is inert without a callback', () => {
  const events: ExportProgress[] = []
  const report = progressReporter((progress) => events.push(progress))
  report('package', 'Writing…')
  report('package', 'Writing chunk 2 of 5…', { completed: 2, total: 5 })
  report('done', 'Wrote it')
  assert.deepEqual(events, [
    { stage: 'package', message: 'Writing…' },
    { stage: 'package', message: 'Writing chunk 2 of 5…', completed: 2, total: 5 },
    { stage: 'done', message: 'Wrote it' },
  ])
  assert.doesNotThrow(() => progressReporter()('done', 'nothing listens'))
})

test('resultAddsAnatomicalOrientation never tags a 2D result', () => {
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.nii.gz'), 2), false)
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.ome.zarr.ozx', { x: {}, y: {} }), 2), false)
})

test('resultAddsAnatomicalOrientation follows the ingest rule for an ITK source', () => {
  // ingest tagged a 3D NIfTI, so its level carries orientations too; either
  // signal alone is enough.
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.nii.gz', { x: {}, y: {}, z: {} }), 3), true)
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.nii.gz'), 3), true)
  assert.equal(resultAddsAnatomicalOrientation(loaded('IM0001'), 3), true)
  assert.equal(resultAddsAnatomicalOrientation(loaded('stack.png'), 3), false)
})

test('resultAddsAnatomicalOrientation trusts the orientation an OME-Zarr or OME-TIFF source declared', () => {
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.ome.zarr.ozx', { x: {}, y: {}, z: {} }), 3), true)
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.ome.tif', { x: {}, y: {}, z: {} }), 3), true)
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.ome.zarr.ozx'), 3), false)
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.ome.tif'), 3), false)
})

test('axisMetadataFor keeps the units and orientations of the registered axes, in their order', () => {
  const [lr, pa, is] = [LPS.x!, LPS.y!, LPS.z!]
  const image: AxisMetadata = {
    axesUnits: { t: 'second', z: 'micrometer', y: 'micrometer', x: 'micrometer' },
    axesOrientations: { x: lr, y: pa, z: is },
  }

  const metadata = axisMetadataFor(image, ['z', 'y', 'x'])
  assert.deepEqual(metadata, {
    axesUnits: { z: 'micrometer', y: 'micrometer', x: 'micrometer' },
    axesOrientations: { z: is, y: pa, x: lr },
  })
  assert.deepEqual(Object.keys(metadata.axesOrientations!), ['z', 'y', 'x'])
  // A single slice squeezed away leaves its axis out.
  assert.deepEqual(axisMetadataFor(image, ['y', 'x']), {
    axesUnits: { y: 'micrometer', x: 'micrometer' },
    axesOrientations: { y: pa, x: lr },
  })
})

test('axisMetadataFor leaves out what the level does not carry for the registered axes', () => {
  assert.deepEqual(axisMetadataFor({ axesUnits: undefined, axesOrientations: undefined }, ['y', 'x']), {
    axesUnits: undefined,
    axesOrientations: undefined,
  })
  // Only the channel axis has a unit, and it is not registered.
  assert.deepEqual(axisMetadataFor({ axesUnits: { c: 'micrometer' }, axesOrientations: undefined }, ['y', 'x']), {
    axesUnits: undefined,
    axesOrientations: undefined,
  })
})

test('exportScaleFactors is empty for an image that fits the budget', () => {
  // 256 x 256 int16 = 128 KiB, the size of the registered CT slice.
  assert.deepEqual(exportScaleFactors(shape(['y', 'x'], [256, 256]), 128 * 1024), [])
  assert.deepEqual(exportScaleFactors(shape(['y', 'x'], [256, 256]), 50 * 1024 * 1024), [])
})

test('exportScaleFactors extends the pyramid until a level fits, as ingest does', () => {
  // 1 MiB int16 image, 256 KiB budget: ÷2 gives 256 KiB, which fits.
  assert.deepEqual(exportScaleFactors(shape(['y', 'x'], [1024, 512]), 256 * 1024), [2])
  assert.deepEqual(exportScaleFactors(shape(['y', 'x'], [1024, 512]), 64 * 1024), [2, 4])
})

test(`exportScaleFactors caps the pyramid at ${EXPORT_LEVEL_CAP} levels`, () => {
  // 32 MiB uint8 volume against a 1 KiB budget would need ÷2 … ÷64.
  const volume = shape(['z', 'y', 'x'], [512, 256, 256], 'uint8')
  assert.deepEqual(exportScaleFactors(volume, 1024), [2, 4, 8])
  assert.equal(exportScaleFactors(volume, 1024).length, EXPORT_LEVEL_CAP - 1)
})

test('inPlaneScaleFactors leaves z alone and skips non-spatial dims', () => {
  assert.deepEqual(inPlaneScaleFactors([2, 4], ['z', 'y', 'x']), [
    { z: 1, y: 2, x: 2 },
    { z: 1, y: 4, x: 4 },
  ])
  assert.deepEqual(inPlaneScaleFactors([2], ['c', 'z', 'y', 'x']), [{ z: 1, y: 2, x: 2 }])
  assert.deepEqual(inPlaneScaleFactors([2], ['y', 'x']), [{ y: 2, x: 2 }])
  assert.deepEqual(inPlaneScaleFactors([], ['z', 'y', 'x']), [])
})

test('omeTiffPlaneCount counts one read per non-XY index per level', () => {
  assert.equal(omeTiffPlaneCount({ images: [shape(['y', 'x'], [256, 256])] }), 1)
  assert.equal(omeTiffPlaneCount({ images: [shape(['y', 'x'], [256, 256]), shape(['y', 'x'], [128, 128])] }), 2)
  // A volume's sub-levels keep the full z extent, so every level reads every plane.
  assert.equal(
    omeTiffPlaneCount({ images: [shape(['z', 'y', 'x'], [5, 8, 8]), shape(['z', 'y', 'x'], [5, 4, 4])] }),
    10,
  )
  assert.equal(omeTiffPlaneCount({ images: [shape(['t', 'c', 'z', 'y', 'x'], [2, 3, 5, 8, 8])] }), 30)
  assert.throws(() => omeTiffPlaneCount({ images: [] }), /empty multiscales/)
})

test('canUseDeflateWorkers follows the SharedArrayBuffer global, which Node always has', () => {
  assert.equal(canUseDeflateWorkers(), typeof SharedArrayBuffer !== 'undefined')
  assert.equal(canUseDeflateWorkers(), true)
})

test('toWriterError keeps an Error and makes an Emscripten exception pointer readable', () => {
  const error = new Error('boom')
  assert.equal(toWriterError(error, 'registered.png'), error)

  const fromNumber = toWriterError(452728, 'registered.png')
  assert.match(fromNumber.message, /registered\.png/)
  assert.match(fromNumber.message, /code 452728/)
  assert.match(fromNumber.message, /image’s pixel type or dimension/)

  const fromTransformWriter = toWriterError(708496, 'transform.xfm', 'transform')
  assert.match(fromTransformWriter.message, /transform\.xfm/)
  assert.match(fromTransformWriter.message, /code 708496/)
  assert.match(fromTransformWriter.message, /transform’s type, number of stages, or dimension/)

  assert.equal(toWriterError('nope', 'registered.nrrd').message, 'Could not write registered.nrrd: nope')
})
