// Output format registry for the download pickers: the formats the registered
// image and the fixed-to-moving transform can be written in, with the label
// each shows in its `wa-select`, the extension its file gets, and the `kind`
// the exporters dispatch on. Modeled on fidnii's `OUTPUT_FORMAT_LABELS` /
// `FORMAT_EXTENSION` / `outputFilename` (examples/convert/converter.ts).
//
// Pure data and string functions, free of DOM access and of the ITK-Wasm
// pipeline packages, so Node unit tests and the UI modules can import it.

/** Writer an image format is routed to. */
export type ImageFormatKind = 'ozx' | 'ome-tiff' | 'itk'

/** Writer a transform format is routed to. */
export type TransformFormatKind = 'ozx' | 'itk' | 'json'

/** Identifiers of the image formats, in the order the picker lists them. */
export type ImageFormatId =
  | 'ozx'
  | 'ome-tiff'
  | 'nrrd'
  | 'nii'
  | 'nii.gz'
  | 'mha'
  | 'vtk'
  | 'hdf5'
  | 'mgh'
  | 'mnc'
  | 'mrc'
  | 'gipl'
  | 'pic'
  | 'aim'
  | 'fdf'
  | 'bmp'
  | 'jpg'
  | 'png'
  | 'iwi.cbor'

/** Identifiers of the transform formats, in the order the picker lists them. */
export type TransformFormatId =
  | 'ozx-transform'
  | 'h5'
  | 'hdf5'
  | 'tfm'
  | 'txt'
  | 'mat'
  | 'xfm'
  | 'iwt.cbor'
  | 'elastix-json'

/** One entry of a format picker. */
export interface OutputFormat<Id extends string, Kind extends string> {
  /** Value of the `wa-option`; for `itk` kinds also the extension the ITK-Wasm writer keys on. */
  id: Id
  /** Text of the `wa-option`. */
  label: string
  /** Extension the file is named with, leading dot included. */
  extension: string
  /** Writer the exporter dispatches to. */
  kind: Kind
}

export type ImageFormat = OutputFormat<ImageFormatId, ImageFormatKind>
export type TransformFormat = OutputFormat<TransformFormatId, TransformFormatKind>

/**
 * Image formats in picker order: OME-Zarr OZX (the default), OME-TIFF, then
 * the `@itk-wasm/image-io` formats fidnii's converter offers, plus
 * `iwi.cbor`. For the `itk` kind the `id` is the extension itk-wasm's
 * `getFileExtension` reports (compound for `nii.gz` and `iwi.cbor`), which is
 * what `writeImage` selects the writer by. Note `iwi.cbor`: `writeImage`
 * mis-tags the byte order of multi-byte pixels (see src/io/iwi-cbor.ts), so
 * the exporter should encode that one in JavaScript.
 */
export const IMAGE_FORMATS: readonly ImageFormat[] = [
  { id: 'ozx', label: 'OME-Zarr (.ome.zarr.ozx)', extension: '.ome.zarr.ozx', kind: 'ozx' },
  { id: 'ome-tiff', label: 'OME-TIFF (.ome.tif)', extension: '.ome.tif', kind: 'ome-tiff' },
  { id: 'nrrd', label: 'NRRD (.nrrd)', extension: '.nrrd', kind: 'itk' },
  { id: 'nii', label: 'NIfTI (.nii)', extension: '.nii', kind: 'itk' },
  { id: 'nii.gz', label: 'NIfTI compressed (.nii.gz)', extension: '.nii.gz', kind: 'itk' },
  { id: 'mha', label: 'MetaImage (.mha)', extension: '.mha', kind: 'itk' },
  { id: 'vtk', label: 'VTK (.vtk)', extension: '.vtk', kind: 'itk' },
  { id: 'hdf5', label: 'HDF5 (.hdf5)', extension: '.hdf5', kind: 'itk' },
  { id: 'mgh', label: 'MGH (.mgh)', extension: '.mgh', kind: 'itk' },
  { id: 'mnc', label: 'MINC (.mnc)', extension: '.mnc', kind: 'itk' },
  { id: 'mrc', label: 'MRC (.mrc)', extension: '.mrc', kind: 'itk' },
  { id: 'gipl', label: 'GIPL (.gipl)', extension: '.gipl', kind: 'itk' },
  { id: 'pic', label: 'BioRad (.pic)', extension: '.pic', kind: 'itk' },
  { id: 'aim', label: 'Scanco AIM (.aim)', extension: '.aim', kind: 'itk' },
  { id: 'fdf', label: 'Varian FDF (.fdf)', extension: '.fdf', kind: 'itk' },
  { id: 'bmp', label: 'BMP (.bmp)', extension: '.bmp', kind: 'itk' },
  { id: 'jpg', label: 'JPEG (.jpg)', extension: '.jpg', kind: 'itk' },
  { id: 'png', label: 'PNG (.png)', extension: '.png', kind: 'itk' },
  { id: 'iwi.cbor', label: 'ITK-Wasm image (.iwi.cbor)', extension: '.iwi.cbor', kind: 'itk' },
]

/**
 * Transform formats in picker order: the OME-Zarr RFC-5 transform-only OZX
 * (the default), the `@itk-wasm/transform-io` formats, and elastix's own
 * TransformParameters JSON. `tfm` is absent from transform-io's
 * extension table, so `writeTransform` probes each writer for it; ITK's text
 * transform writer accepts the extension. `h5` and `hdf5` share a writer.
 */
export const TRANSFORM_FORMATS: readonly TransformFormat[] = [
  { id: 'ozx-transform', label: 'OME-Zarr transform (.ome.zarr.ozx)', extension: '.ome.zarr.ozx', kind: 'ozx' },
  { id: 'h5', label: 'ITK HDF5 (.h5)', extension: '.h5', kind: 'itk' },
  { id: 'hdf5', label: 'ITK HDF5 (.hdf5)', extension: '.hdf5', kind: 'itk' },
  { id: 'tfm', label: 'ITK text (.tfm)', extension: '.tfm', kind: 'itk' },
  { id: 'txt', label: 'ITK text (.txt)', extension: '.txt', kind: 'itk' },
  { id: 'mat', label: 'MATLAB (.mat)', extension: '.mat', kind: 'itk' },
  { id: 'xfm', label: 'MINC XFM (.xfm)', extension: '.xfm', kind: 'itk' },
  { id: 'iwt.cbor', label: 'ITK-Wasm transform (.iwt.cbor)', extension: '.iwt.cbor', kind: 'itk' },
  { id: 'elastix-json', label: 'elastix TransformParameters (.json)', extension: '.json', kind: 'json' },
]

/** The image format the picker starts on. */
export const DEFAULT_IMAGE_FORMAT: ImageFormat = IMAGE_FORMATS[0]

/** The transform format the picker starts on. */
export const DEFAULT_TRANSFORM_FORMAT: TransformFormat = TRANSFORM_FORMATS[0]

function byId<Format extends OutputFormat<string, string>>(formats: readonly Format[]): ReadonlyMap<string, Format> {
  return new Map(formats.map((format) => [format.id, format]))
}

const imageFormatsById = byId(IMAGE_FORMATS)
const transformFormatsById = byId(TRANSFORM_FORMATS)

/** Whether `id` names an image format. */
export function isImageFormatId(id: string): id is ImageFormatId {
  return imageFormatsById.has(id)
}

/** Whether `id` names a transform format. */
export function isTransformFormatId(id: string): id is TransformFormatId {
  return transformFormatsById.has(id)
}

/**
 * The image format named `id`, typically a picker's value. Throws on a name
 * the registry does not have: the pickers are filled from the registry, so
 * an unknown value is a bug rather than user input.
 */
export function imageFormatById(id: string): ImageFormat {
  const format = imageFormatsById.get(id)
  if (format === undefined) {
    throw new Error(`Unknown image format: ${id}`)
  }
  return format
}

/** The transform format named `id`; throws on an unknown name like {@link imageFormatById}. */
export function transformFormatById(id: string): TransformFormat {
  const format = transformFormatsById.get(id)
  if (format === undefined) {
    throw new Error(`Unknown transform format: ${id}`)
  }
  return format
}

/**
 * Input extensions with more than one part, matched (case-insensitively)
 * before the single-part fallback so `brain.nii.gz` becomes `brain`, not
 * `brain.nii`. fidnii's list, plus the ITK-Wasm transform containers.
 */
const COMPOUND_EXTENSIONS: readonly RegExp[] = [
  /\.ome\.zarr\.ozx$/i,
  /\.ome\.zarr$/i,
  /\.ome\.tiff?$/i,
  /\.nii\.gz$/i,
  /\.gipl\.gz$/i,
  /\.mnc\.gz$/i,
  /\.mgh\.gz$/i,
  /\.iwi\.cbor\.zst$/i,
  /\.iwi\.cbor$/i,
  /\.iwt\.cbor\.zst$/i,
  /\.iwt\.cbor$/i,
]

/**
 * `base` without its extension. One compound extension is stripped when the
 * name ends with one, otherwise the final single-part extension is (so a
 * name with no extension, or a lone dotfile name, is returned as is).
 */
export function stripImageExtension(base: string): string {
  for (const compound of COMPOUND_EXTENSIONS) {
    if (compound.test(base)) {
      return base.replace(compound, '')
    }
  }
  const stripped = base.replace(/\.[^/.]+$/, '')
  return stripped === '' ? base : stripped
}

/**
 * File name for `base` written as `format`: `base` with its input
 * extension(s) replaced by the format's, the way fidnii's converter names its
 * output after its input. `base` may be a bare stem (`registered`) or an
 * input file name (`CT_2D_head_fixed.mha`, `brain.nii.gz`).
 */
export function outputFilename(base: string, format: OutputFormat<string, string>): string {
  return `${stripImageExtension(base)}${format.extension}`
}
