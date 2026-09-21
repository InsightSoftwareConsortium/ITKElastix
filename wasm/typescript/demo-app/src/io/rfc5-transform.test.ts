// Unit tests for the RFC-5 transform builders. Run with `pnpm test:unit`;
// these stay out of test/ so Playwright never picks them up.
//
// The ITK fixtures use values that are exact in binary floating point
// (halves and quarters), so the converted matrices can be compared with
// deepEqual rather than a tolerance. The round-trip test, which goes back
// through ngff-zarr's inverse converter, uses a tolerance because the change
// of frame multiplies by direction matrices.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createNgffImage,
  createMetadata,
  createMultiscales,
  INTRINSIC_COORDINATE_SYSTEM_NAME,
  LPS,
  ngffTransformToItkTransform,
  NgffImage,
  RAS,
  readOzxVersion,
  type Affine,
  type AnatomicalOrientation,
  type CoordinateSystem,
} from '@fideus-labs/ngff-zarr'
import type { Transform, TransformList } from 'itk-wasm'

import { memoryStoreFromZip, ROOT_METADATA_KEY } from './ozx-store.ts'
import {
  assertTransformMatchesSystems,
  buildCoordinateSystem,
  buildFixedToMovingTransform,
  buildRfc5TransformSet,
  embedInMultiscales,
  FIXED_COORDINATE_SYSTEM_NAME,
  FIXED_TO_MOVING_TRANSFORM_NAME,
  MOVING_COORDINATE_SYSTEM_NAME,
  registrationDims,
  transformOnlyOzx,
  TRANSFORM_OME_ZARR_VERSION,
  type TransformFrame,
} from './rfc5-transform.ts'

const PLACEHOLDER = 'data:application/vnd.itk.address,0:0'

/** The `Composite` marker elastix puts in front of its stage transforms. */
const COMPOSITE_HEADER = {
  transformType: {
    transformParameterization: 'Composite',
    parametersValueType: 'float64',
    inputDimension: 2,
    outputDimension: 2,
  },
  numberOfParameters: 0,
  numberOfFixedParameters: 0,
  name: '',
  inputSpaceName: '',
  outputSpaceName: '',
  parameters: PLACEHOLDER,
  fixedParameters: PLACEHOLDER,
} as unknown as Transform

/**
 * An ITK-Wasm `Affine` entry. `matrix` is row-major in ITK's x, y order and
 * `center` is the center of rotation ITK's `fixedParameters` carry.
 */
function itkAffine(matrix: number[][], translation: number[], center: number[] = []): Transform {
  const dimension = translation.length
  return {
    transformType: {
      transformParameterization: 'Affine',
      parametersValueType: 'float64',
      inputDimension: dimension,
      outputDimension: dimension,
    },
    numberOfParameters: dimension * dimension + dimension,
    numberOfFixedParameters: center.length,
    name: '',
    inputSpaceName: '',
    outputSpaceName: '',
    parameters: new Float64Array([...matrix.flat(), ...translation]),
    fixedParameters: new Float64Array(center),
  } as unknown as Transform
}

/** An ITK-Wasm `Translation` entry. */
function itkTranslation(translation: number[]): Transform {
  return {
    transformType: {
      transformParameterization: 'Translation',
      parametersValueType: 'float64',
      inputDimension: translation.length,
      outputDimension: translation.length,
    },
    numberOfParameters: translation.length,
    numberOfFixedParameters: 0,
    name: '',
    inputSpaceName: '',
    outputSpaceName: '',
    parameters: new Float64Array(translation),
    fixedParameters: new Float64Array(0),
  } as unknown as Transform
}

// `AnatomicalOrientationValues` is a TypeScript enum, so the presets are the
// readable way to name an orientation: LPS is the frame ITK works in, and RAS
// flips x and y against it.
const LPS_2D: Record<string, AnatomicalOrientation> = { x: LPS.x!, y: LPS.y! }

/** An {@link NgffImage} carrying the metadata the builders read. */
async function ngffImage(options: {
  dims: string[]
  shape?: number[]
  scale?: Record<string, number>
  translation?: Record<string, number>
  axesUnits?: Record<string, string>
  axesOrientations?: Record<string, AnatomicalOrientation>
}): Promise<NgffImage> {
  const { dims } = options
  const shape = options.shape ?? dims.map(() => 4)
  const scale = options.scale ?? Object.fromEntries(dims.map((dim) => [dim, 1]))
  const translation = options.translation ?? Object.fromEntries(dims.map((dim) => [dim, 0]))
  const base = await createNgffImage([], shape, 'float32', dims, scale, translation)
  return new NgffImage({
    ...base,
    axesUnits: options.axesUnits,
    axesOrientations: options.axesOrientations,
    computedCallbacks: undefined,
  })
}

/** A 2D {@link TransformFrame} with the given NgffImage metadata. */
async function frame2d(
  options: Parameters<typeof ngffImage>[0] = { dims: ['y', 'x'] },
): Promise<TransformFrame> {
  return { dimension: 2, ngffImage: await ngffImage(options) }
}

function assertClose(actual: number[][], expected: number[][], message: string): void {
  assert.equal(actual.length, expected.length, message)
  actual.forEach((row, i) => {
    assert.equal(row.length, expected[i]!.length, message)
    row.forEach((value, j) => {
      assert.ok(
        Math.abs(value - expected[i]![j]!) < 1e-9,
        `${message}: [${i}][${j}] is ${value}, expected ${expected[i]![j]}`,
      )
    })
  })
}

test('registrationDims names the axes of the space elastix registered in', () => {
  assert.deepEqual(registrationDims(2), ['y', 'x'])
  assert.deepEqual(registrationDims(3), ['z', 'y', 'x'])
})

test('buildCoordinateSystem carries each axis unit and RFC-4 orientation', async () => {
  const image = await ngffImage({
    dims: ['y', 'x'],
    axesUnits: { y: 'millimeter', x: 'millimeter' },
    axesOrientations: LPS_2D,
  })

  assert.deepEqual(buildCoordinateSystem('fixed', image), {
    name: 'fixed',
    axes: [
      { name: 'y', type: 'space', unit: 'millimeter', orientation: LPS_2D.y },
      { name: 'x', type: 'space', unit: 'millimeter', orientation: LPS_2D.x },
    ],
  })
})

test('buildCoordinateSystem omits the unit and orientation an image does not carry', async () => {
  const image = await ngffImage({ dims: ['z', 'y', 'x'] })
  const system = buildCoordinateSystem('moving', image)

  assert.deepEqual(system.axes.map((axis) => axis.name), ['z', 'y', 'x'])
  for (const axis of system.axes) {
    assert.equal(axis.type, 'space')
    assert.equal(axis.unit, undefined)
    assert.equal(axis.orientation, undefined)
  }
  // `undefined` fields are dropped by JSON.stringify, matching what
  // ngff-zarr's own writer puts on the wire.
  assert.equal(JSON.stringify(system.axes[0]), '{"name":"z","type":"space"}')
})

test('buildCoordinateSystem over a dims subset keeps the source axis metadata', async () => {
  // An RGB PNG ingests as a 'c' axis and a single-slice volume loses its 'z'
  // axis before elastix sees it; the transform lives in the reduced space.
  const image = await ngffImage({
    dims: ['c', 'y', 'x'],
    axesUnits: { y: 'micrometer', x: 'micrometer' },
  })
  const system = buildCoordinateSystem('fixed', image, registrationDims(2))

  assert.deepEqual(system.axes, [
    { name: 'y', type: 'space', unit: 'micrometer' },
    { name: 'x', type: 'space', unit: 'micrometer' },
  ])
})

test('buildCoordinateSystem types the channel and time axes and refuses an unknown one', async () => {
  const image = await ngffImage({ dims: ['t', 'c', 'y', 'x'], axesUnits: { t: 'second', y: 'meter', x: 'meter' } })
  const system = buildCoordinateSystem('source', image)

  // `createAxis` always sets `unit`, so a channel axis carries an explicit
  // `undefined` that JSON.stringify drops on the way to the store.
  assert.deepEqual(system.axes, [
    { name: 't', type: 'time', unit: 'second' },
    { name: 'c', type: 'channel', unit: undefined },
    { name: 'y', type: 'space', unit: 'meter' },
    { name: 'x', type: 'space', unit: 'meter' },
  ])
  assert.equal(JSON.stringify(system.axes[1]), '{"name":"c","type":"channel"}')
  assert.throws(() => buildCoordinateSystem('bad', image, ['q']), /dimension 'q'/)
})

test('buildFixedToMovingTransform drops the Composite header and converts to Zarr axis order', async () => {
  // ITK: y = A (p - c) + t + c, with A row-major in x, y order.
  const matrix = [
    [1.5, 0.25],
    [-0.5, 0.75],
  ]
  const list: TransformList = [COMPOSITE_HEADER, itkAffine(matrix, [3, -4], [10, 20])]
  const fixed = await frame2d()
  const moving = await frame2d()

  const affine = buildFixedToMovingTransform(list, fixed, moving, 'fixed', 'moving')

  // RFC-5: the center folds into the offset (b = t + c - A c, so
  // b = [13 - 20, 16 - 10] = [-7, 6] in ITK order), and the rows and columns
  // are permuted from ITK's x, y into the dims order y, x.
  assert.deepEqual(affine, {
    type: 'affine',
    affine: [
      [0.75, -0.5, 6],
      [0.25, 1.5, -7],
    ],
    name: FIXED_TO_MOVING_TRANSFORM_NAME,
    input: { name: 'fixed' },
    output: { name: 'moving' },
  })
})

test('buildFixedToMovingTransform composes the stages in the order ITK applies them', async () => {
  // An ITK composite applies its last entry first, so the scale is applied
  // to the already-translated point: p -> S (p + d).
  const scale = itkAffine(
    [
      [2, 0],
      [0, 3],
    ],
    [0, 0],
  )
  const list: TransformList = [COMPOSITE_HEADER, scale, itkTranslation([5, 7])]
  const fixed = await frame2d()

  const affine = buildFixedToMovingTransform(list, fixed, await frame2d(), 'fixed', 'moving')

  // ITK order: matrix diag(2, 3), offset [10, 21]. In y, x order that is
  // diag(3, 2) with offset [21, 10]; the other composition order would put
  // the untouched [5, 7] there.
  assert.deepEqual(affine.affine, [
    [3, 0, 21],
    [0, 2, 10],
  ])
})

test('buildFixedToMovingTransform refuses a list whose dimension is not the registration dimension', async () => {
  const list: TransformList = [COMPOSITE_HEADER, itkAffine([[2]], [1])]
  await assert.rejects(
    async () => buildFixedToMovingTransform(list, await frame2d(), await frame2d(), 'fixed', 'moving'),
    /requires exactly 6/,
  )
})

test('LPS orientations and non-zero origins leave the mapping alone, because their direction is the identity', async () => {
  const matrix = [
    [1.5, 0.25],
    [-0.5, 0.75],
  ]
  const list: TransformList = [COMPOSITE_HEADER, itkAffine(matrix, [3, -4], [10, 20])]
  const plain = buildFixedToMovingTransform(list, await frame2d(), await frame2d(), 'fixed', 'moving')

  const oriented = buildFixedToMovingTransform(
    list,
    await frame2d({ dims: ['y', 'x'], translation: { y: -12, x: 7 }, axesOrientations: LPS_2D }),
    await frame2d({ dims: ['y', 'x'], translation: { y: 3.5, x: -2 }, axesOrientations: LPS_2D }),
    'fixed',
    'moving',
  )

  assert.deepEqual(oriented.affine, plain.affine)
})

test('a flipped fixed image changes the frame, and the conversion round trips back to ITK', async () => {
  const matrix = [
    [1.5, 0.25],
    [-0.5, 0.75],
  ]
  const translation = [3, -4]
  const list: TransformList = [COMPOSITE_HEADER, itkAffine(matrix, translation, [0, 0])]
  // RAS on x: the fixed image's x axis runs opposite to ITK's LPS x.
  const flipped: Record<string, AnatomicalOrientation> = { x: RAS.x!, y: LPS.y! }
  const fixed = await frame2d({ dims: ['y', 'x'], translation: { y: -12, x: 7 }, axesOrientations: flipped })
  const moving = await frame2d({ dims: ['y', 'x'], translation: { y: 3.5, x: -2 }, axesOrientations: LPS_2D })

  const affine = buildFixedToMovingTransform(list, fixed, moving, 'fixed', 'moving')
  const plain = buildFixedToMovingTransform(list, await frame2d(), await frame2d(), 'fixed', 'moving')
  assert.notDeepEqual(affine.affine, plain.affine, 'the change of frame must show up in the matrix')

  const [recovered] = ngffTransformToItkTransform(affine, registrationDims(2), {
    fixed: fixed.ngffImage,
    moving: moving.ngffImage,
  })
  const parameters = Array.from(recovered!.parameters as Float64Array)
  assertClose([parameters.slice(0, 2), parameters.slice(2, 4)], matrix, 'round-tripped ITK matrix')
  assertClose([parameters.slice(4, 6)], [translation], 'round-tripped ITK translation')
})

const SYSTEM_2D: CoordinateSystem = {
  name: 'fixed',
  axes: [
    { name: 'y', type: 'space', unit: undefined },
    { name: 'x', type: 'space', unit: undefined },
  ],
}
const MOVING_2D: CoordinateSystem = { ...SYSTEM_2D, name: 'moving' }

function affine2d(rows: number[][] = [[1, 0, 0], [0, 1, 0]]): Affine {
  return { type: 'affine', affine: rows, name: FIXED_TO_MOVING_TRANSFORM_NAME, input: { name: 'fixed' }, output: { name: 'moving' } }
}

test('assertTransformMatchesSystems accepts a matching affine', () => {
  assert.doesNotThrow(() => assertTransformMatchesSystems(affine2d(), SYSTEM_2D, MOVING_2D))
})

test('assertTransformMatchesSystems rejects a matrix sized for other coordinate systems', () => {
  const threeD: CoordinateSystem = { name: 'moving', axes: [...MOVING_2D.axes, { name: 'z', type: 'space', unit: undefined }] }
  assert.throws(() => assertTransformMatchesSystems(affine2d(), SYSTEM_2D, threeD), /must be 3x3/)
  assert.throws(() => assertTransformMatchesSystems(affine2d([[1, 0], [0, 1]]), SYSTEM_2D, MOVING_2D), /must be 2x3/)
})

test('assertTransformMatchesSystems rejects a non-finite value, which OME-Zarr would store as null', () => {
  assert.throws(
    () => assertTransformMatchesSystems(affine2d([[Number.NaN, 0, 0], [0, 1, 0]]), SYSTEM_2D, MOVING_2D),
    /non-finite/,
  )
})

test('assertTransformMatchesSystems rejects an affine naming a system that is not being written', () => {
  const wrong: Affine = { ...affine2d(), output: { name: 'elsewhere' } }
  assert.throws(() => assertTransformMatchesSystems(wrong, SYSTEM_2D, MOVING_2D), /names 'elsewhere' as its output/)
  assert.throws(() => assertTransformMatchesSystems({ ...affine2d(), input: undefined }, SYSTEM_2D, MOVING_2D), /\(none\)/)
})

/** A single-level pyramid the way `toMultiscales` leaves one, with the intrinsic system. */
async function multiscales2d() {
  const image = await ngffImage({ dims: ['y', 'x'] })
  const axes = [
    { name: 'y', type: 'space', unit: undefined },
    { name: 'x', type: 'space', unit: undefined },
  ]
  const metadata = createMetadata(axes, [{ path: 'scale0', coordinateTransformations: [] }], 'image', '0.6')
  metadata.coordinateSystems = [{ name: INTRINSIC_COORDINATE_SYSTEM_NAME, axes }]
  return createMultiscales([image], metadata)
}

test('embedInMultiscales lists the intrinsic and moving systems and the affine between them', async () => {
  const multiscales = await multiscales2d()
  const affine: Affine = { ...affine2d(), input: { name: INTRINSIC_COORDINATE_SYSTEM_NAME } }

  const embedded = embedInMultiscales(multiscales, affine, MOVING_2D)

  assert.equal(embedded, multiscales, 'the pyramid is mutated in place')
  assert.deepEqual(
    embedded.metadata.coordinateSystems?.map((system) => system.name),
    [INTRINSIC_COORDINATE_SYSTEM_NAME, 'moving'],
  )
  assert.deepEqual(embedded.metadata.coordinateSystems?.[0]?.axes, embedded.metadata.axes)
  assert.deepEqual(embedded.metadata.coordinateTransformations, [affine])
})

test('embedInMultiscales refuses an affine that does not name the intrinsic system', async () => {
  const multiscales = await multiscales2d()
  await assert.rejects(
    async () => embedInMultiscales(multiscales, affine2d(), MOVING_2D),
    /names 'fixed' as its input/,
  )
  assert.equal(multiscales.metadata.coordinateTransformations, undefined, 'nothing is written on a refusal')
})

test('transformOnlyOzx writes an RFC-9 archive holding one RFC-5 scene group', () => {
  const affine = affine2d([
    [0.75, -0.5, 6],
    [0.25, 1.5, -7],
  ])

  const zip = transformOnlyOzx(affine, SYSTEM_2D, MOVING_2D)

  assert.equal(readOzxVersion(zip), TRANSFORM_OME_ZARR_VERSION)
  const store = memoryStoreFromZip(zip)
  assert.deepEqual([...store.keys()], [ROOT_METADATA_KEY])

  const group = JSON.parse(new TextDecoder().decode(store.get(ROOT_METADATA_KEY)!))
  assert.equal(group.zarr_format, 3)
  assert.equal(group.node_type, 'group')
  assert.equal(group.attributes.ome.version, TRANSFORM_OME_ZARR_VERSION)

  const { coordinateSystems, coordinateTransformations } = group.attributes.ome.scene
  assert.deepEqual(coordinateSystems, [
    { name: 'fixed', axes: [{ name: 'y', type: 'space' }, { name: 'x', type: 'space' }] },
    { name: 'moving', axes: [{ name: 'y', type: 'space' }, { name: 'x', type: 'space' }] },
  ])
  assert.deepEqual(coordinateTransformations, [
    {
      type: 'affine',
      affine: [
        [0.75, -0.5, 6],
        [0.25, 1.5, -7],
      ],
      name: FIXED_TO_MOVING_TRANSFORM_NAME,
      input: { name: 'fixed' },
      output: { name: 'moving' },
    },
  ])
})

test('transformOnlyOzx serializes the axis unit and orientation', () => {
  const oriented: CoordinateSystem = {
    name: 'fixed',
    axes: [
      { name: 'y', type: 'space', unit: 'millimeter', orientation: LPS_2D.y },
      { name: 'x', type: 'space', unit: 'millimeter', orientation: LPS_2D.x },
    ],
  }
  const zip = transformOnlyOzx(affine2d(), oriented, MOVING_2D)
  const group = JSON.parse(new TextDecoder().decode(memoryStoreFromZip(zip).get(ROOT_METADATA_KEY)!))

  assert.deepEqual(group.attributes.ome.scene.coordinateSystems[0].axes[0], {
    name: 'y',
    type: 'space',
    unit: 'millimeter',
    orientation: { type: 'anatomical', value: 'anterior-to-posterior' },
  })
})

test('buildRfc5TransformSet names the standalone and embedded inputs differently', async () => {
  const list: TransformList = [COMPOSITE_HEADER, itkAffine([[1.5, 0.25], [-0.5, 0.75]], [3, -4], [10, 20])]
  const fixed = await frame2d({ dims: ['y', 'x'], axesUnits: { y: 'millimeter', x: 'millimeter' } })
  const moving = await frame2d()

  const set = buildRfc5TransformSet(list, fixed, moving)

  assert.equal(set.fixedSystem.name, FIXED_COORDINATE_SYSTEM_NAME)
  assert.equal(set.movingSystem.name, MOVING_COORDINATE_SYSTEM_NAME)
  assert.deepEqual(set.fixedSystem.axes.map((axis) => axis.unit), ['millimeter', 'millimeter'])
  assert.deepEqual(set.movingSystem.axes.map((axis) => axis.unit), [undefined, undefined])
  assert.deepEqual(set.standalone.input, { name: FIXED_COORDINATE_SYSTEM_NAME })
  assert.deepEqual(set.embedded.input, { name: INTRINSIC_COORDINATE_SYSTEM_NAME })
  assert.deepEqual(set.embedded.affine, set.standalone.affine, 'the same mapping, written twice')
  assert.deepEqual(set.embedded.output, { name: MOVING_COORDINATE_SYSTEM_NAME })

  // Both forms are writable: the standalone one against its own systems, the
  // embedded one against the registered image's intrinsic system.
  assert.doesNotThrow(() => transformOnlyOzx(set.standalone, set.fixedSystem, set.movingSystem))
  const multiscales = await multiscales2d()
  assert.doesNotThrow(() => embedInMultiscales(multiscales, set.embedded, set.movingSystem))
})

test('buildRfc5TransformSet builds the reduced space for a source with a channel axis', async () => {
  const list: TransformList = [COMPOSITE_HEADER, itkAffine([[1, 0], [0, 1]], [0, 0])]
  // A 3D single-slice fixed image squeezed to 2D, against an RGB moving image.
  const fixed = await frame2d({ dims: ['z', 'y', 'x'], shape: [1, 4, 4] })
  const moving = await frame2d({ dims: ['c', 'y', 'x'], shape: [3, 4, 4] })

  const set = buildRfc5TransformSet(list, fixed, moving)

  assert.deepEqual(set.fixedSystem.axes.map((axis) => axis.name), ['y', 'x'])
  assert.deepEqual(set.movingSystem.axes.map((axis) => axis.name), ['y', 'x'])
  assert.equal(set.standalone.affine.length, 2)
  assert.deepEqual(set.standalone.affine[0]?.length, 3)
})
