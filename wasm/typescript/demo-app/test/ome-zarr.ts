// Readers for the OME-Zarr archives the demo downloads, shared by the
// output and 3D specs: unzip an `.ozx` in Node, parse its root `zarr.json`,
// and check the shape of an RFC-5 affine. No browser involved, so these
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
  affine?: number[][]
}

/** The parts of an OME-Zarr 0.6 root `zarr.json` the specs read. */
export interface OzxRootDoc {
  zarr_format: number
  node_type: string
  attributes: {
    ome: {
      version: string
      /** Transformations between images: where the transform-only store keeps its affine. */
      scene?: { coordinateSystems?: CoordinateSystemDoc[]; coordinateTransformations: TransformationDoc[] }
      /** The image pyramid: where the registered image's store keeps its affine. */
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
