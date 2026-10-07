// Readers for the OME-Zarr archives the demo downloads, shared by the
// output and 3D specs: unzip an `.ozx` in Node, parse its root `zarr.json`,
// and check the shape of the staged RFC-5 transform. No browser involved, so these
// take the download's bytes rather than a page. Not a spec: Playwright
// collects only `*.spec.ts`.
import { expect } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'

/** The RFC-5 fields the specs read from a coordinate system. */
export interface CoordinateSystemDoc {
  name: string
  axes: { name: string }[]
}

/** The RFC-5 fields the specs read from a coordinate transformation. */
export interface TransformationDoc {
  type: string
  name?: string
  input?: { name?: string; path?: string }
  output?: { name?: string; path?: string }
  translation?: number[]
  rotation?: number[][]
  affine?: number[][]
  /** A `sequence`'s stages, the first applied first. */
  transformations?: TransformationDoc[]
}

/** The parts of an OME-Zarr 0.6 root `zarr.json` the specs read. */
export interface OzxRootDoc {
  zarr_format: number
  node_type: string
  attributes: {
    ome: {
      version: string
      /** Transformations between images: where the transform-only store keeps its transform. */
      scene?: { coordinateSystems?: CoordinateSystemDoc[]; coordinateTransformations: TransformationDoc[] }
      /** The image pyramid: where the registered image's store keeps its transform. */
      multiscales?: { coordinateSystems: CoordinateSystemDoc[]; coordinateTransformations?: TransformationDoc[] }[]
    }
  }
}

/** An unzipped OZX: its entry names in archive order and the parsed root `zarr.json`. */
export interface OzxContents {
  entries: string[]
  root: OzxRootDoc
}

/** Unzip the downloaded OZX `bytes` (named `filename` in messages) and parse its root document. */
export function parseOzx(bytes: Uint8Array, filename: string): OzxContents {
  const unzipped = unzipSync(bytes)
  const entries = Object.keys(unzipped)
  const rootBytes = unzipped['zarr.json']
  if (!rootBytes) {
    throw new Error(`${filename} has no root zarr.json; its entries are ${entries.join(', ')}`)
  }
  return { entries, root: JSON.parse(strFromU8(rootBytes)) as OzxRootDoc }
}

/** `matrix` is the M x (M+1) block of an RFC-5 affine over `dimension` axes, with finite entries. */
export function expectAffineMatrix(matrix: number[][] | undefined, dimension: number): void {
  expect(matrix).toHaveLength(dimension)
  for (const row of matrix ?? []) {
    expect(row).toHaveLength(dimension + 1)
    for (const value of row) {
      expect(Number.isFinite(value), `${value} in row ${JSON.stringify(row)} should be a finite number`).toBe(true)
    }
  }
}

/** `values` holds `length` finite numbers; `what` names it in messages. */
function expectFiniteNumbers(values: number[] | undefined, length: number, what: string): void {
  expect(values, what).toHaveLength(length)
  for (const value of values ?? []) {
    expect(Number.isFinite(value), `${value} in ${what} should be a finite number`).toBe(true)
  }
}

/**
 * `transform` is the demo's fixed-to-moving `sequence` over `dimension`
 * axes: elastix's translation, rigid, and affine stages in the order a point
 * passes through them, with finite entries. The translation stage is a
 * `translation`; the rigid stage, since RFC-5 has no rigid type, is a
 * nested `sequence` of a `rotation` and then a `translation`, and the
 * rotation must have orthonormal rows, which a transposed or garbage matrix
 * would not; the affine stage is an `affine`.
 */
export function expectRegistrationStages(transform: TransformationDoc | undefined, dimension: number): void {
  expect(transform?.type).toBe('sequence')
  const stages = transform?.transformations ?? []
  expect(stages.map((stage) => stage.name)).toEqual(['translation', 'rigid', 'affine'])
  expect(stages.map((stage) => stage.type)).toEqual(['translation', 'sequence', 'affine'])
  const [translation, rigid, affine] = stages
  expectFiniteNumbers(translation?.translation, dimension, 'the translation stage')

  expect(rigid?.transformations?.map((part) => part.type)).toEqual(['rotation', 'translation'])
  const [rotation, offset] = rigid?.transformations ?? []
  expect(rotation?.rotation).toHaveLength(dimension)
  for (const row of rotation?.rotation ?? []) {
    expectFiniteNumbers(row, dimension, "a row of the rigid stage's rotation")
  }
  for (const [i, row] of (rotation?.rotation ?? []).entries()) {
    for (const [j, other] of (rotation?.rotation ?? []).entries()) {
      const dot = row.reduce((sum, value, k) => sum + value * other[k]!, 0)
      expect(Math.abs(dot - (i === j ? 1 : 0)), `rows ${i} and ${j} of the rigid stage's rotation`).toBeLessThan(1e-6)
    }
  }
  expectFiniteNumbers(offset?.translation, dimension, "the rigid stage's translation")

  expectAffineMatrix(affine?.affine, dimension)
}

function identity(size: number): number[][] {
  return Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => (i === j ? 1 : 0)))
}

function multiply(a: number[][], b: number[][]): number[][] {
  return a.map((row) => b[0]!.map((_, column) => row.reduce((sum, value, k) => sum + value * b[k]![column]!, 0)))
}

/** `stage` as a homogeneous matrix over `dimension` axes. */
function homogeneous(stage: TransformationDoc | undefined, dimension: number): number[][] {
  let block: number[][]
  switch (stage?.type) {
    case 'sequence':
      // RFC-5 applies a sequence's first entry first, so each one multiplies
      // onto the left.
      return (stage.transformations ?? []).reduce(
        (total, inner) => multiply(homogeneous(inner, dimension), total),
        identity(dimension + 1),
      )
    case 'translation':
      block = identity(dimension).map((row, i) => [...row, stage.translation?.[i] ?? Number.NaN])
      break
    case 'rotation':
      block = (stage.rotation ?? []).map((row) => [...row, 0])
      break
    case 'affine':
      block = stage.affine ?? []
      break
    default:
      throw new Error(`cannot compose a '${stage?.type}' transformation`)
  }
  return [...block, [...identity(dimension)[0]!.map(() => 0), 1]]
}

/** The M x (M+1) block an RFC-5 `sequence` over `dimension` axes composes to. */
export function composeStages(transform: TransformationDoc | undefined, dimension: number): number[][] {
  return homogeneous(transform, dimension).slice(0, -1)
}
