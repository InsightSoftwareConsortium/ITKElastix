// Scale selection for the ingest pipeline: decide how many pyramid levels to
// build and which level to hand to elastix, given an in-memory pixel budget.
//
// Keep this module free of DOM access so workers and Node unit tests can
// reuse it. The helpers only read `dims` and `data.{shape,dtype}` so tests
// can pass plain objects instead of real zarr arrays.
import type { NgffImage } from '@fideus-labs/ngff-zarr/browser'

/** Largest image buffer, in bytes, that elastix is handed for registration. */
export const PIXEL_BUDGET_BYTES = 50 * 1024 * 1024

/** Dimensions that downsampling shrinks; 'c' and 't' are carried through. */
export const SPATIAL_DIMS: readonly string[] = ['x', 'y', 'z']

/** The subset of {@link NgffImage} these helpers read. */
export interface ImageShapeInfo {
  readonly dims: readonly string[]
  readonly data: {
    readonly shape: readonly number[]
    readonly dtype: string
  }
}

/** Bytes needed for one element of a zarr dtype such as 'uint8' or 'float32'. */
export function bytesPerElement(dtype: string): number {
  if (dtype === 'bool') {
    return 1
  }
  const match = /^(?:u?int|float)(8|16|32|64)$/.exec(dtype)
  if (!match) {
    throw new Error(`Unsupported image dtype for byte estimation: ${dtype}`)
  }
  return Number(match[1]) / 8
}

/** Uncompressed size of an array with the given shape and dtype. */
export function shapeBytes(shape: readonly number[], dtype: string): number {
  return shape.reduce((count, extent) => count * extent, 1) * bytesPerElement(dtype)
}

/** Uncompressed size of the full array behind an image. */
export function ngffImageBytes(image: ImageShapeInfo): number {
  return shapeBytes(image.data.shape, image.data.dtype)
}

/**
 * Estimate the buffer size of the level produced by dividing every spatial
 * extent by `factor`. Non-spatial dims ('c', 't') keep their extent.
 */
export function estimateLevelBytes(image: ImageShapeInfo, factor: number): number {
  const shape = image.dims.map((dim, index) => {
    const extent = image.data.shape[index]
    return SPATIAL_DIMS.includes(dim) ? Math.max(1, Math.floor(extent / factor)) : extent
  })
  return shapeBytes(shape, image.data.dtype)
}

/**
 * Isotropic spatial scale factors `[2, 4, 8, ...]` for `toMultiscales`,
 * extended only until the estimated level buffer drops to or below
 * `budgetBytes`. Returns `[]` when the base image already fits. The loop
 * also stops once every spatial extent has collapsed to 1, so an image whose
 * non-spatial dims alone exceed the budget still terminates.
 */
export function planScaleFactors(
  image: ImageShapeInfo,
  budgetBytes: number = PIXEL_BUDGET_BYTES,
): number[] {
  const factors: number[] = []
  if (estimateLevelBytes(image, 1) <= budgetBytes) {
    return factors
  }
  const spatialExtents = image.dims
    .map((dim, index) => (SPATIAL_DIMS.includes(dim) ? image.data.shape[index] : 1))
  const largestSpatialExtent = Math.max(1, ...spatialExtents)
  for (let factor = 2; ; factor *= 2) {
    factors.push(factor)
    if (estimateLevelBytes(image, factor) <= budgetBytes || factor >= largestSpatialExtent) {
      break
    }
  }
  return factors
}

/**
 * Index of the finest pyramid level (levels are ordered finest to coarsest)
 * whose uncompressed size fits `budgetBytes`, else the coarsest level.
 */
export function selectScaleForBudget(
  multiscales: { readonly images: readonly ImageShapeInfo[] },
  budgetBytes: number = PIXEL_BUDGET_BYTES,
): number {
  const { images } = multiscales
  if (images.length === 0) {
    throw new Error('Cannot select a scale from an empty multiscales pyramid')
  }
  const fitting = images.findIndex((image) => ngffImageBytes(image) <= budgetBytes)
  return fitting === -1 ? images.length - 1 : fitting
}
