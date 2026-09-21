// Input normalization for registration: the steps between "one pyramid
// level as an ITK-Wasm Image" and "the scalar 2D or 3D image elastix
// receives", plus the pair check the splash runs before handing the inputs
// to the app. elastix needs two scalar images of the same dimension, so:
//
// - time points and channels are reduced to one (t = 0, c = 0) when the
//   level is read ({@link registrationSliceOptions}); RGB or RGBA images
//   from PNG/JPEG arrive as a 'c' axis after `itkImageToNgffImage`, and a
//   4D NIfTI as a 't' axis. The counts are kept for display
//   ({@link channelAndTimepointInfo});
// - a 3D image that is one voxel thick along an axis is squeezed to 2D
//   ({@link squeezeSingletonAxis}), so a 2D OME-TIFF or a single-slice
//   NIfTI registers as 2D;
// - the byte size elastix is handed is measured on that final image
//   ({@link registrationBytesOf});
// - a pair whose dimensions differ is rejected with a readable error
//   ({@link assertCompatiblePair}) before it reaches the app.
//
// Keep this module free of DOM access and of value imports from
// load-image.ts so the Node unit tests can import it. Display code that
// needs the opposite of the squeeze uses src/viewer/promote-to-3d.ts.
import type { Image } from 'itk-wasm'

import { bytesPerElement, type ImageShapeInfo } from './scale-select.ts'

/** ITK axis names in physical order: index `i` of `size`, `spacing`, `origin`. */
export const SPATIAL_AXES = ['x', 'y', 'z'] as const

export type SpatialAxis = (typeof SPATIAL_AXES)[number]

/** Time point handed to elastix when the source has a 't' axis. */
export const REGISTRATION_TIMEPOINT_INDEX = 0

/** Channel handed to elastix when the source has a 'c' axis. */
export const REGISTRATION_CHANNEL_INDEX = 0

/** The `tIndex` / `cIndex` options of ngff-zarr's `ngffImageToItkImage`. */
export interface SliceOptions {
  tIndex?: number
  cIndex?: number
}

/**
 * Slice options that reduce a level to one time point and one channel:
 * `tIndex` is set only when the image has a 't' axis and `cIndex` only
 * when it has a 'c' axis, so the result is `{}` for a plain spatial image.
 */
export function registrationSliceOptions(image: Pick<ImageShapeInfo, 'dims'>): SliceOptions {
  const options: SliceOptions = {}
  if (image.dims.includes('t')) {
    options.tIndex = REGISTRATION_TIMEPOINT_INDEX
  }
  if (image.dims.includes('c')) {
    options.cIndex = REGISTRATION_CHANNEL_INDEX
  }
  return options
}

/** Channel and time point counts of a source, for display. */
export interface ChannelTimepointInfo {
  /** Extent of the 'c' axis; 1 when there is none. */
  channelCount: number
  /** Channel the registration image holds; see {@link REGISTRATION_CHANNEL_INDEX}. */
  channelIndex: number
  /** Extent of the 't' axis; 1 when there is none. */
  timepointCount: number
}

/** Extent of `dim` in `image`, or 1 when the image has no such axis. */
function extentOf(image: ImageShapeInfo, dim: string): number {
  const index = image.dims.indexOf(dim)
  return index === -1 ? 1 : image.data.shape[index]
}

/** Channel and time point counts of a level (any pyramid level agrees). */
export function channelAndTimepointInfo(image: ImageShapeInfo): ChannelTimepointInfo {
  return {
    channelCount: extentOf(image, 'c'),
    channelIndex: REGISTRATION_CHANNEL_INDEX,
    timepointCount: extentOf(image, 't'),
  }
}

/**
 * Index of the axis {@link squeezeSingletonAxis} drops: the last axis of
 * extent 1 (z before y before x, so a stack of one axial slice keeps x and
 * y), or undefined when every extent is larger than 1.
 */
export function findSingletonAxis(size: readonly number[]): number | undefined {
  const axis = size.lastIndexOf(1)
  return axis === -1 ? undefined : axis
}

/**
 * Return a 2D copy of a 3D image with `axis` (0 = x, 1 = y, 2 = z; extent
 * must be 1) removed: its spacing, origin, and size entries are dropped and
 * the row and column of the 3x3 direction matrix are struck out, leaving
 * the 2x2 in-plane cosines. The pixel buffer is shared with the input: a
 * single-slice axis contributes nothing to the memory layout, whichever
 * axis it is. This is the inverse of `promoteTo3d` for the z axis.
 */
export function squeezeAxis(image: Image, axis: number): Image {
  const { dimension } = image.imageType
  if (dimension !== 3) {
    throw new Error(`squeezeAxis expects a 3D image, got ${dimension}D`)
  }
  if (!Number.isInteger(axis) || axis < 0 || axis >= 3) {
    throw new Error(`squeezeAxis expects an axis index of 0, 1, or 2, got ${axis}`)
  }
  if (image.size[axis] !== 1) {
    throw new Error(
      `Cannot squeeze the ${SPATIAL_AXES[axis]} axis: its extent is ${image.size[axis]}, and only a single-slice axis can be dropped`,
    )
  }
  const source = image.direction
  if (source.length !== 9) {
    throw new Error(`squeezeAxis expects a 3x3 direction, got ${source.length} elements`)
  }
  const kept = [0, 1, 2].filter((index) => index !== axis)
  // The same index formula is used on both sides, so the block is correct
  // whether itk-wasm stores the flat matrix row- or column-major.
  const direction = new Float64Array(4)
  kept.forEach((row, r) => {
    kept.forEach((col, c) => {
      direction[r * 2 + c] = Number(source[row * 3 + col])
    })
  })

  return {
    imageType: { ...image.imageType, dimension: 2 },
    name: image.name,
    origin: kept.map((index) => image.origin[index]),
    spacing: kept.map((index) => image.spacing[index]),
    direction,
    size: kept.map((index) => image.size[index]),
    metadata: new Map(image.metadata),
    data: image.data,
  }
}

export interface SqueezeResult {
  /** The 2D image, or the input itself when nothing was squeezed. */
  image: Image
  /** The axis that was dropped, when one was. */
  squeezedAxis?: SpatialAxis
}

/**
 * Squeeze a single-slice 3D image to 2D; any other image (2D already, 3D
 * with every extent above 1, or another dimension) is returned as is.
 */
export function squeezeSingletonAxis(image: Image): SqueezeResult {
  if (image.imageType.dimension !== 3) {
    return { image, squeezedAxis: undefined }
  }
  const axis = findSingletonAxis(image.size)
  if (axis === undefined) {
    return { image, squeezedAxis: undefined }
  }
  return { image: squeezeAxis(image, axis), squeezedAxis: SPATIAL_AXES[axis] }
}

/**
 * Byte size of the pixel buffer elastix receives: the buffer's own length,
 * or, for an image whose data has not been materialized, the size the
 * extents, components, and component type imply.
 */
export function registrationBytesOf(image: Image): number {
  if (image.data !== null) {
    return image.data.byteLength
  }
  const { componentType, components } = image.imageType
  return image.size.reduce((count, extent) => count * extent, 1) * components * bytesPerElement(componentType)
}

/** What {@link normalizeForRegistration} settles about one input. */
export interface NormalizedImage {
  /** Scalar 2D or 3D image for elastix. */
  itkImage: Image
  /** Spatial dimension of {@link itkImage}. */
  dimension: 2 | 3
  /** Byte size of `itkImage`'s pixel buffer. */
  registrationBytes: number
  /** Axis dropped when a single-slice volume was squeezed to 2D. */
  squeezedAxis?: SpatialAxis
}

/**
 * Turn the ITK-Wasm image read from a pyramid level (already reduced to one
 * time point and channel) into the image elastix receives: a single-slice
 * volume is squeezed to 2D, the result must be scalar and 2D or 3D, and its
 * byte size is measured. `name` labels the errors.
 */
export function normalizeForRegistration(image: Image, name: string = image.name): NormalizedImage {
  const { components, pixelType } = image.imageType
  if (components !== 1) {
    throw new Error(
      `Expected a scalar image for registration, got ${components} components (${pixelType}) in ${name}; select a channel first`,
    )
  }
  const { image: itkImage, squeezedAxis } = squeezeSingletonAxis(image)
  const { dimension } = itkImage.imageType
  if (dimension !== 2 && dimension !== 3) {
    throw new Error(`Expected a 2D or 3D image after ingest, got ${dimension}D (${name})`)
  }
  return { itkImage, dimension, registrationBytes: registrationBytesOf(itkImage), squeezedAxis }
}

/** The parts of a loaded input that {@link assertCompatiblePair} reads. */
export interface RegistrationInput {
  name: string
  dimension: number
  itkImage: Pick<Image, 'imageType'>
}

/**
 * Throw a descriptive error unless `fixed` and `moving` can be registered
 * together: both scalar, both of the same dimension. The splash shows the
 * message in its danger callout and stays open.
 */
export function assertCompatiblePair(fixed: RegistrationInput, moving: RegistrationInput): void {
  for (const [role, input] of [
    ['fixed', fixed],
    ['moving', moving],
  ] as const) {
    const { components, pixelType } = input.itkImage.imageType
    if (components !== 1) {
      throw new Error(
        `The ${role} image ${input.name} has ${components} components (${pixelType}); elastix needs scalar images`,
      )
    }
  }
  if (fixed.dimension !== moving.dimension) {
    throw new Error(
      `The fixed image ${fixed.name} is ${fixed.dimension}D but the moving image ${moving.name} is ${moving.dimension}D; ` +
        'elastix needs both images to have the same dimension. Load two 2D images or two 3D images.',
    )
  }
}
