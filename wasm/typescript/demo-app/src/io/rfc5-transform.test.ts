// Unit tests for the RFC-5 transform builders. Run with `pnpm test:unit`;
// these stay out of test/ so Playwright never picks them up.
//
// The ITK fixtures use values that are exact in binary floating point
// (halves and quarters), so the converted matrices can be compared with
// deepEqual rather than a tolerance. The tests that turn a rotation through
// an angle or go back through ngff-zarr's inverse converter use a tolerance,
// because a sine is rarely exact and the change of frame multiplies by
// direction matrices.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createNgffImage,
  createMetadata,
  createMultiscales,
  INTRINSIC_COORDINATE_SYSTEM_NAME,
  itkTransformToNgffTransform,
  LPS,
  ngffTransformToItkTransform,
  NgffImage,
  RAS,
  readOzxVersion,
  type Affine,
  type AnatomicalOrientation,
  type CoordinateSystem,
  type Rotation,
  type TransformSequence,
  type Translation,
  type V06Transform,
} from '@fideus-labs/ngff-zarr'
import type { Transform, TransformList } from 'itk-wasm'

import { memoryStoreFromZip, ROOT_METADATA_KEY } from './ozx-store.ts'
import { withAffineStages, withoutCompositeHeader, withTypedParameterArrays } from './transform-list.ts'
import {
  assertTransformMatchesSystems,
  buildCoordinateSystem,
  buildFixedToMovingTransform,
  buildRfc5TransformSet,
  CHANGE_OF_FRAME_STAGE_NAME,
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

/** An ITK-Wasm `Euler2D` entry: `[angle, tx, ty]` with the center of rotation as fixed parameters. */
function itkEuler2D(angle: number, translation: number[], center: number[]): Transform {
  return {
    transformType: {
      transformParameterization: 'Euler2D',
      parametersValueType: 'float64',
      inputDimension: 2,
      outputDimension: 2,
    },
    numberOfParameters: 3,
    numberOfFixedParameters: 2,
    name: '',
    inputSpaceName: '',
    outputSpaceName: '',
    parameters: new Float64Array([angle, ...translation]),
    fixedParameters: new Float64Array(center),
  } as unknown as Transform
}

/** The matrix of an `affine` stage, failing the test for any other type. */
function stageAffine(stage: V06Transform | undefined): number[][] {
  assert.equal(stage?.type, 'affine')
  return (stage as Affine).affine
}

/**
 * The rotation and translation of a rigid stage, failing the test unless it
 * is a `sequence` of exactly those two, in that order.
 */
function rigidParts(stage: V06Transform | undefined): { rotation: number[][]; translation: number[] } {
  assert.equal(stage?.type, 'sequence')
  const parts = (stage as TransformSequence).transformations
  assert.deepEqual(
    parts.map((part) => part.type),
    ['rotation', 'translation'],
  )
  return { rotation: (parts[0] as Rotation).rotation, translation: (parts[1] as Translation).translation }
}

function multiply(a: number[][], b: number[][]): number[][] {
  return a.map((row) => b[0]!.map((_, column) => row.reduce((sum, value, k) => sum + value * b[k]![column]!, 0)))
}

function identity(size: number): number[][] {
  return Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => (i === j ? 1 : 0)))
}

/** `stage` as a homogeneous matrix over `dimension` axes. */
function homogeneous(stage: V06Transform, dimension: number): number[][] {
  if (stage.type === 'sequence') {
    // RFC-5 applies a sequence's first entry first, so each one multiplies
    // onto the left.
    return stage.transformations.reduce((total, inner) => multiply(homogeneous(inner, dimension), total), identity(dimension + 1))
  }
  let block: number[][]
  if (stage.type === 'translation') {
    block = identity(dimension).map((row, i) => [...row, stage.translation[i]!])
  } else if (stage.type === 'rotation') {
    block = stage.rotation.map((row) => [...row, 0])
  } else {
    block = stageAffine(stage)
  }
  return [...block, [...identity(dimension)[0]!.map(() => 0), 1]]
}

/** The M x (M+1) block `sequence` composes to over `dimension` axes. */
function composed(sequence: TransformSequence, dimension = 2): number[][] {
  return homogeneous(sequence, dimension).slice(0, -1)
}

/**
 * The single affine the whole list converts to, which is what the demo
 * wrote before it kept the stages apart, and what they must compose to.
 */
function singleAffine(list: TransformList, fixed: TransformFrame, moving: TransformFrame): number[][] {
  const converted = itkTransformToNgffTransform(
    withAffineStages(withTypedParameterArrays(withoutCompositeHeader(list))),
    registrationDims(fixed.dimension),
    false,
    { fixed: fixed.ngffImage, moving: moving.ngffImage },
  )
  return stageAffine(converted)
}

test('buildFixedToMovingTransform drops the Composite header and converts to Zarr axis order', async () => {
  // ITK: y = A (p - c) + t + c, with A row-major in x, y order.
  const matrix = [
    [1.5, 0.25],
    [-0.5, 0.75],
  ]
  const list: TransformList = [COMPOSITE_HEADER, itkAffine(matrix, [3, -4], [10, 20])]
  const fixed = await frame2d()
  const moving = await frame2d()

  const sequence = buildFixedToMovingTransform(list, fixed, moving, 'fixed', 'moving')

  // RFC-5: the center folds into the offset (b = t + c - A c, so
  // b = [13 - 20, 16 - 10] = [-7, 6] in ITK order), and the rows and columns
  // are permuted from ITK's x, y into the dims order y, x.
  assert.deepEqual(sequence, {
    type: 'sequence',
    transformations: [
      {
        type: 'affine',
        affine: [
          [0.75, -0.5, 6],
          [0.25, 1.5, -7],
        ],
        name: 'affine',
      },
    ],
    name: FIXED_TO_MOVING_TRANSFORM_NAME,
    input: { name: 'fixed' },
    output: { name: 'moving' },
  })
})

test('buildFixedToMovingTransform writes one named transformation per elastix stage, in the order a point passes through them', async () => {
  // elastix's translation -> rigid -> affine run, in ITK composite order: the
  // last entry is applied first.
  const list: TransformList = [
    COMPOSITE_HEADER,
    itkAffine(
      [
        [2, 0],
        [0, 3],
      ],
      [0, 0],
    ),
    itkEuler2D(Math.PI, [3, -4], [10, 20]),
    itkTranslation([5, 7]),
  ]
  const fixed = await frame2d()
  const moving = await frame2d()

  const sequence = buildFixedToMovingTransform(list, fixed, moving, 'fixed', 'moving')

  assert.equal(sequence.type, 'sequence')
  assert.deepEqual(
    sequence.transformations.map((stage) => stage.name),
    ['translation', 'rigid', 'affine'],
  )
  const [translation, rigid, affine] = sequence.transformations
  // Every stage in the dims order y, x. The rigid stage is a half turn about
  // (10, 20), rotating first and translating second: b = t + c - R c =
  // [3 + 20, -4 + 40] in ITK order.
  assert.deepEqual(translation, { type: 'translation', translation: [7, 5], name: 'translation' })
  const parts = rigidParts(rigid)
  assertClose(
    parts.rotation,
    [
      [-1, 0],
      [0, -1],
    ],
    'rigid rotation',
  )
  assertClose([parts.translation], [[36, 23]], 'rigid translation')
  assert.deepEqual(stageAffine(affine), [
    [3, 0, 0],
    [0, 2, 0],
  ])
  assertClose(composed(sequence), singleAffine(list, fixed, moving), 'the stages compose to the whole list')
})

test('buildFixedToMovingTransform accepts the Euler2D rigid stage elastix returns', async () => {
  // elastix's rigid stage stores an angle, which ngff-zarr refuses; the
  // builder rewrites it as the equivalent affine first, so a turn about
  // (10, 20) with a translation must map points where the same transform
  // given as an Affine entry outright does, while still being written as the
  // rigid stage it came from.
  const fixed = await frame2d()
  const moving = await frame2d()
  const fromEuler = buildFixedToMovingTransform(
    [COMPOSITE_HEADER, itkEuler2D(Math.PI / 2, [3, -4], [10, 20])],
    fixed,
    moving,
    'fixed',
    'moving',
  )
  const fromAffine = buildFixedToMovingTransform(
    [
      COMPOSITE_HEADER,
      itkAffine(
        [
          [0, -1],
          [1, 0],
        ],
        [3, -4],
        [10, 20],
      ),
    ],
    fixed,
    moving,
    'fixed',
    'moving',
  )

  const [rigid] = fromEuler.transformations
  assert.equal(rigid?.name, 'rigid')
  rigidParts(rigid)
  assert.equal(fromAffine.transformations[0]?.name, 'affine')
  assertClose(composed(fromEuler), composed(fromAffine), 'Euler2D vs Affine')
})

test('buildFixedToMovingTransform tolerates the placeholder string of a zero-count parameter field', async () => {
  // itk-wasm leaves `data:application/vnd.itk.address,0:0` in a field whose
  // count is zero (the Translation stage has no fixed parameters), and
  // ngff-zarr would count the string's characters as fixed parameters.
  const translation = { ...itkTranslation([5, 7]), fixedParameters: PLACEHOLDER } as unknown as Transform
  const sequence = buildFixedToMovingTransform([COMPOSITE_HEADER, translation], await frame2d(), await frame2d(), 'fixed', 'moving')

  assert.deepEqual(sequence.transformations, [{ type: 'translation', translation: [7, 5], name: 'translation' }])
})

test('buildFixedToMovingTransform puts the stages in the order ITK applies them', async () => {
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

  const sequence = buildFixedToMovingTransform(list, await frame2d(), await frame2d(), 'fixed', 'moving')

  // An RFC-5 sequence applies its first entry first, so the translation leads.
  assert.deepEqual(sequence.transformations, [
    { type: 'translation', translation: [7, 5], name: 'translation' },
    {
      type: 'affine',
      affine: [
        [3, 0, 0],
        [0, 2, 0],
      ],
      name: 'affine',
    },
  ])
  // ITK order: matrix diag(2, 3), offset [10, 21]. In y, x order that is
  // diag(3, 2) with offset [21, 10]; the other composition order would put
  // the untouched [5, 7] there.
  assert.deepEqual(composed(sequence), [
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

test('buildFixedToMovingTransform refuses a list with no stages', async () => {
  await assert.rejects(
    async () => buildFixedToMovingTransform([COMPOSITE_HEADER], await frame2d(), await frame2d(), 'fixed', 'moving'),
    /no transform stages/,
  )
})

test('LPS orientations and non-zero origins leave the mapping alone, because their direction is the identity', async () => {
  const matrix = [
    [1.5, 0.25],
    [-0.5, 0.75],
  ]
  const list: TransformList = [COMPOSITE_HEADER, itkAffine(matrix, [3, -4], [10, 20]), itkTranslation([5, 7])]
  const plain = buildFixedToMovingTransform(list, await frame2d(), await frame2d(), 'fixed', 'moving')

  const oriented = buildFixedToMovingTransform(
    list,
    await frame2d({ dims: ['y', 'x'], translation: { y: -12, x: 7 }, axesOrientations: LPS_2D }),
    await frame2d({ dims: ['y', 'x'], translation: { y: 3.5, x: -2 }, axesOrientations: LPS_2D }),
    'fixed',
    'moving',
  )

  assert.deepEqual(oriented, plain)
})

// RAS on x: the image's x axis runs opposite to ITK's LPS x.
const FLIPPED_X: Record<string, AnatomicalOrientation> = { x: RAS.x!, y: LPS.y! }

test('a flipped fixed image changes the frame, and the sequence round trips back to ITK', async () => {
  const matrix = [
    [1.5, 0.25],
    [-0.5, 0.75],
  ]
  const translation = [3, -4]
  const list: TransformList = [COMPOSITE_HEADER, itkAffine(matrix, translation, [0, 0]), itkTranslation([5, 7])]
  const fixed = await frame2d({ dims: ['y', 'x'], translation: { y: -12, x: 7 }, axesOrientations: FLIPPED_X })
  const moving = await frame2d({ dims: ['y', 'x'], translation: { y: 3.5, x: -2 }, axesOrientations: LPS_2D })

  const sequence = buildFixedToMovingTransform(list, fixed, moving, 'fixed', 'moving')
  const plain = buildFixedToMovingTransform(list, await frame2d(), await frame2d(), 'fixed', 'moving')
  assert.notDeepEqual(composed(sequence), composed(plain), 'the change of frame must show up in the mapping')
  assertClose(composed(sequence), singleAffine(list, fixed, moving), 'the stages compose to the whole list')

  // ngff-zarr's inverse composes the sequence and changes frame back into
  // ITK physical space, where the two stages are y = M (p + d) + t.
  const [recovered] = ngffTransformToItkTransform(sequence, registrationDims(2), {
    fixed: fixed.ngffImage,
    moving: moving.ngffImage,
  })
  const parameters = Array.from(recovered!.parameters as Float64Array)
  assertClose([parameters.slice(0, 2), parameters.slice(2, 4)], matrix, 'round-tripped ITK matrix')
  // M d + t = [7.5 + 1.75 + 3, -2.5 + 5.25 - 4]
  assertClose([parameters.slice(4, 6)], [[12.25, -1.25]], 'round-tripped ITK translation')
})

test('a flipped fixed image leaves the translation a translation and the rigid stage a rotation', async () => {
  const list: TransformList = [
    COMPOSITE_HEADER,
    itkAffine(
      [
        [1.5, 0.25],
        [-0.5, 0.75],
      ],
      [3, -4],
      [1, 2],
    ),
    itkEuler2D(Math.PI / 6, [2, -1], [10, 20]),
    itkTranslation([5, 7]),
  ]
  const fixed = await frame2d({ dims: ['y', 'x'], translation: { y: -12, x: 7 }, axesOrientations: FLIPPED_X })
  const moving = await frame2d({ dims: ['y', 'x'], translation: { y: 3.5, x: -2 }, axesOrientations: LPS_2D })

  const sequence = buildFixedToMovingTransform(list, fixed, moving, 'fixed', 'moving')
  const plain = buildFixedToMovingTransform(list, await frame2d(), await frame2d(), 'fixed', 'moving')

  // Only the last stage carries the change into the moving frame. The
  // translation and rigid stages run from the fixed frame back into it, so
  // the flip negates the translation's x component...
  const [translation, rigid] = sequence.transformations
  assert.deepEqual(translation, { type: 'translation', translation: [7, -5], name: 'translation' })
  // ...and reverses the sense of the rotation, which stays a rotation.
  const { rotation } = rigidParts(rigid)
  const plainRotation = rigidParts(plain.transformations[1]).rotation
  assertClose(rotation, [plainRotation.map((row) => row[0]!), plainRotation.map((row) => row[1]!)], 'reversed rotation')
  assertClose(multiply(rotation, [rotation.map((row) => row[0]!), rotation.map((row) => row[1]!)]), [[1, 0], [0, 1]], 'R Rᵀ')
  assert.ok(Math.abs(rotation[0]![0]! * rotation[1]![1]! - rotation[0]![1]! * rotation[1]![0]! - 1) < 1e-12, 'det R = 1')

  assertClose(composed(sequence), singleAffine(list, fixed, moving), 'the stages compose to the whole list')
  // ngff-zarr's own inverse reads the nested rigid sequence and its rotation
  // back into the same ITK transform.
  const frames = { fixed: fixed.ngffImage, moving: moving.ngffImage }
  const [fromStages] = ngffTransformToItkTransform(sequence, registrationDims(2), frames)
  const [fromSingle] = ngffTransformToItkTransform(
    { type: 'affine', affine: singleAffine(list, fixed, moving) },
    registrationDims(2),
    frames,
  )
  assertClose(
    [Array.from(fromStages!.parameters as Float64Array)],
    [Array.from(fromSingle!.parameters as Float64Array)],
    'ITK parameters read back',
  )
})

test('stages after the last affine one run in the moving frame, so a translation there stays a translation', async () => {
  // Applied in the order translation, affine, translation: ITK lists them
  // backwards.
  const list: TransformList = [
    COMPOSITE_HEADER,
    itkTranslation([-1, 2]),
    itkAffine(
      [
        [1.5, 0.25],
        [-0.5, 0.75],
      ],
      [3, -4],
    ),
    itkTranslation([5, 7]),
  ]
  const fixed = await frame2d({ dims: ['y', 'x'], translation: { y: -12, x: 7 }, axesOrientations: FLIPPED_X })
  const moving = await frame2d({ dims: ['y', 'x'], translation: { y: 3.5, x: -2 }, axesOrientations: LPS_2D })

  const sequence = buildFixedToMovingTransform(list, fixed, moving, 'fixed', 'moving')

  // The first translation is conjugated by the flipped fixed frame, the last
  // by the moving frame, whose direction is the identity.
  assert.deepEqual(sequence.transformations[0], { type: 'translation', translation: [7, -5], name: 'translation' })
  assert.deepEqual(sequence.transformations[2], { type: 'translation', translation: [2, -1], name: 'translation' })
  assertClose(composed(sequence), singleAffine(list, fixed, moving), 'the stages compose to the whole list')
})

test('a list with no affine stage ends on the change of frame when the two frames differ', async () => {
  const list: TransformList = [COMPOSITE_HEADER, itkEuler2D(Math.PI / 6, [2, -1], [10, 20]), itkTranslation([5, 7])]
  // The flip makes the change of frame a mirror, which neither a translation
  // nor a rotation can hold.
  const fixed = await frame2d({ dims: ['y', 'x'], translation: { y: -12, x: 7 }, axesOrientations: FLIPPED_X })
  const moving = await frame2d({ dims: ['y', 'x'], translation: { y: 3.5, x: -2 }, axesOrientations: LPS_2D })

  const set = buildRfc5TransformSet(list, fixed, moving)

  assert.deepEqual(
    set.standalone.transformations.map((stage) => [stage.name, stage.type]),
    [
      ['translation', 'translation'],
      ['rigid', 'sequence'],
      [CHANGE_OF_FRAME_STAGE_NAME, 'affine'],
    ],
  )
  assertClose(composed(set.standalone), singleAffine(list, fixed, moving), 'the stages compose to the whole list')
})

test('a list with no affine stage ends on its last stage when the two frames agree', async () => {
  const list: TransformList = [COMPOSITE_HEADER, itkEuler2D(Math.PI / 6, [2, -1], [10, 20]), itkTranslation([5, 7])]
  const fixed = await frame2d()
  const moving = await frame2d()

  const sequence = buildFixedToMovingTransform(list, fixed, moving, 'fixed', 'moving')

  assert.deepEqual(
    sequence.transformations.map((stage) => stage.name),
    ['translation', 'rigid'],
  )
  assertClose(composed(sequence), singleAffine(list, fixed, moving), 'the stages compose to the whole list')
})

const SYSTEM_2D: CoordinateSystem = {
  name: 'fixed',
  axes: [
    { name: 'y', type: 'space', unit: undefined },
    { name: 'x', type: 'space', unit: undefined },
  ],
}
const MOVING_2D: CoordinateSystem = { ...SYSTEM_2D, name: 'moving' }

/** A rigid stage the way the builder writes one: a rotation, then a translation. */
function rigid2d(rotation: number[][] = [[0, -1], [1, 0]], translation: number[] = [0, 0]): TransformSequence {
  return {
    type: 'sequence',
    name: 'rigid',
    transformations: [
      { type: 'rotation', rotation },
      { type: 'translation', translation },
    ],
  }
}

function sequence2d(
  transformations: V06Transform[] = [
    { type: 'translation', translation: [0, 0], name: 'translation' },
    rigid2d(),
    { type: 'affine', affine: [[1, 0, 0], [0, 1, 0]], name: 'affine' },
  ],
): TransformSequence {
  return {
    type: 'sequence',
    name: FIXED_TO_MOVING_TRANSFORM_NAME,
    input: { name: 'fixed' },
    output: { name: 'moving' },
    transformations,
  }
}

test('assertTransformMatchesSystems accepts a matching sequence', () => {
  assert.doesNotThrow(() => assertTransformMatchesSystems(sequence2d(), SYSTEM_2D, MOVING_2D))
})

test('assertTransformMatchesSystems rejects a stage sized for other coordinate systems', () => {
  assert.throws(
    () => assertTransformMatchesSystems(sequence2d([{ type: 'affine', affine: [[1, 0], [0, 1]], name: 'affine' }]), SYSTEM_2D, MOVING_2D),
    /Stage 'affine' .* must be 2x3/,
  )
  assert.throws(
    () => assertTransformMatchesSystems(sequence2d([{ type: 'translation', translation: [1, 2, 3] }]), SYSTEM_2D, MOVING_2D),
    /Stage 'translation' .* translates 3 axes/,
  )
  assert.throws(
    () => assertTransformMatchesSystems(sequence2d([rigid2d([[1, 0, 0], [0, 1, 0]])]), SYSTEM_2D, MOVING_2D),
    /Stage 'rigid\/rotation' .* must be 2x2/,
  )
})

test('assertTransformMatchesSystems rejects systems with different numbers of axes', () => {
  const threeD: CoordinateSystem = { name: 'moving', axes: [...MOVING_2D.axes, { name: 'z', type: 'space', unit: undefined }] }
  assert.throws(() => assertTransformMatchesSystems(sequence2d(), SYSTEM_2D, threeD), /\(2 axes\) to 'moving' \(3 axes\)/)
})

test('assertTransformMatchesSystems rejects a non-finite value, which OME-Zarr would store as null', () => {
  assert.throws(
    () => assertTransformMatchesSystems(sequence2d([{ type: 'affine', affine: [[Number.NaN, 0, 0], [0, 1, 0]], name: 'affine' }]), SYSTEM_2D, MOVING_2D),
    /Stage 'affine' .* non-finite/,
  )
  assert.throws(
    () => assertTransformMatchesSystems(sequence2d([rigid2d(undefined, [Infinity, 0])]), SYSTEM_2D, MOVING_2D),
    /Stage 'rigid\/translation' .* non-finite/,
  )
})

test('assertTransformMatchesSystems rejects a rotation RFC-5 would not accept', () => {
  // A mirror is orthonormal with determinant -1; a shear can have determinant
  // 1 without being orthonormal.
  for (const rotation of [
    [
      [-1, 0],
      [0, 1],
    ],
    [
      [1, 0.5],
      [0, 1],
    ],
  ]) {
    assert.throws(
      () => assertTransformMatchesSystems(sequence2d([rigid2d(rotation)]), SYSTEM_2D, MOVING_2D),
      /Stage 'rigid\/rotation' .* is not a proper rotation/,
    )
  }
})

test('assertTransformMatchesSystems rejects a stage type it does not write, and an empty sequence', () => {
  assert.throws(
    () => assertTransformMatchesSystems(sequence2d([{ type: 'scale', scale: [1, 1] }]), SYSTEM_2D, MOVING_2D),
    /is a 'scale'/,
  )
  assert.throws(() => assertTransformMatchesSystems(sequence2d([]), SYSTEM_2D, MOVING_2D), /at least one stage/)
  assert.throws(
    () => assertTransformMatchesSystems(sequence2d([{ type: 'sequence', name: 'rigid', transformations: [] }]), SYSTEM_2D, MOVING_2D),
    /Stage 'rigid' .* is an empty sequence/,
  )
})

test('assertTransformMatchesSystems rejects a sequence naming a system that is not being written', () => {
  const wrong: TransformSequence = { ...sequence2d(), output: { name: 'elsewhere' } }
  assert.throws(() => assertTransformMatchesSystems(wrong, SYSTEM_2D, MOVING_2D), /names 'elsewhere' as its output/)
  assert.throws(() => assertTransformMatchesSystems({ ...sequence2d(), input: undefined }, SYSTEM_2D, MOVING_2D), /\(none\)/)
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

test('embedInMultiscales lists the intrinsic and moving systems and the sequence between them', async () => {
  const multiscales = await multiscales2d()
  const sequence: TransformSequence = { ...sequence2d(), input: { name: INTRINSIC_COORDINATE_SYSTEM_NAME } }

  const embedded = embedInMultiscales(multiscales, sequence, MOVING_2D)

  assert.equal(embedded, multiscales, 'the pyramid is mutated in place')
  assert.deepEqual(
    embedded.metadata.coordinateSystems?.map((system) => system.name),
    [INTRINSIC_COORDINATE_SYSTEM_NAME, 'moving'],
  )
  assert.deepEqual(embedded.metadata.coordinateSystems?.[0]?.axes, embedded.metadata.axes)
  assert.deepEqual(embedded.metadata.coordinateTransformations, [sequence])
})

test('embedInMultiscales refuses a sequence that does not name the intrinsic system', async () => {
  const multiscales = await multiscales2d()
  await assert.rejects(
    async () => embedInMultiscales(multiscales, sequence2d(), MOVING_2D),
    /names 'fixed' as its input/,
  )
  assert.equal(multiscales.metadata.coordinateTransformations, undefined, 'nothing is written on a refusal')
})

test('transformOnlyOzx writes an RFC-9 archive holding one RFC-5 scene group', () => {
  const stages: V06Transform[] = [
    { type: 'translation', translation: [7, 5], name: 'translation' },
    rigid2d([[-1, 0], [0, -1]], [36, 23]),
    { type: 'affine', affine: [[0.75, -0.5, 6], [0.25, 1.5, -7]], name: 'affine' },
  ]

  const zip = transformOnlyOzx(sequence2d(stages), SYSTEM_2D, MOVING_2D)

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
      type: 'sequence',
      transformations: stages,
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
  const zip = transformOnlyOzx(sequence2d(), oriented, MOVING_2D)
  const group = JSON.parse(new TextDecoder().decode(memoryStoreFromZip(zip).get(ROOT_METADATA_KEY)!))

  assert.deepEqual(group.attributes.ome.scene.coordinateSystems[0].axes[0], {
    name: 'y',
    type: 'space',
    unit: 'millimeter',
    orientation: { type: 'anatomical', value: 'anterior-to-posterior' },
  })
})

test('buildRfc5TransformSet names the standalone and embedded inputs differently', async () => {
  const list: TransformList = [
    COMPOSITE_HEADER,
    itkAffine([[1.5, 0.25], [-0.5, 0.75]], [3, -4], [10, 20]),
    itkEuler2D(Math.PI / 6, [2, -1], [10, 20]),
    itkTranslation([5, 7]),
  ]
  const fixed = await frame2d({ dims: ['y', 'x'], axesUnits: { y: 'millimeter', x: 'millimeter' } })
  const moving = await frame2d()

  const set = buildRfc5TransformSet(list, fixed, moving)

  assert.equal(set.fixedSystem.name, FIXED_COORDINATE_SYSTEM_NAME)
  assert.equal(set.movingSystem.name, MOVING_COORDINATE_SYSTEM_NAME)
  assert.deepEqual(set.fixedSystem.axes.map((axis) => axis.unit), ['millimeter', 'millimeter'])
  assert.deepEqual(set.movingSystem.axes.map((axis) => axis.unit), [undefined, undefined])
  assert.deepEqual(set.standalone.input, { name: FIXED_COORDINATE_SYSTEM_NAME })
  assert.deepEqual(set.embedded.input, { name: INTRINSIC_COORDINATE_SYSTEM_NAME })
  assert.deepEqual(set.embedded.transformations, set.standalone.transformations, 'the same mapping, written twice')
  assert.deepEqual(
    set.standalone.transformations.map((stage) => stage.name),
    ['translation', 'rigid', 'affine'],
  )
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
  const [stage] = set.standalone.transformations
  assert.equal(stageAffine(stage).length, 2)
  assert.equal(stageAffine(stage)[0]?.length, 3)
})
