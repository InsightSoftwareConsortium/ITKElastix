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
  /**
   * One or two sentences on what the file holds and who reads it, shown in
   * the tooltip of the download button while the format is selected.
   */
  description: string
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
  {
    id: 'ozx',
    label: 'OME-Zarr (.ome.zarr.ozx)',
    extension: '.ome.zarr.ozx',
    kind: 'ozx',
    description:
      'An OME-Zarr 0.6 multiscale image zipped into one file (RFC-9), with the fixed-to-moving transform embedded ' +
      'as an RFC-5 affine between the image’s intrinsic and the moving coordinate systems. Read by ngff-zarr, and ' +
      'by the fixed and moving pickers of this demo.',
  },
  {
    id: 'ome-tiff',
    label: 'OME-TIFF (.ome.tif)',
    extension: '.ome.tif',
    kind: 'ome-tiff',
    description:
      'A deflate-compressed OME-TIFF with OME-XML metadata, one plane per IFD and sub-resolution levels as SubIFDs ' +
      'when the pyramid has them. Read by Bio-Formats, QuPath, and the pickers of this demo.',
  },
  {
    id: 'nrrd',
    label: 'NRRD (.nrrd)',
    extension: '.nrrd',
    kind: 'itk',
    description:
      'NRRD (Nearly Raw Raster Data): a text header with the origin, spacing, and direction followed by the pixels, ' +
      'in one file. Read by ITK, 3D Slicer, and most medical imaging tools.',
  },
  {
    id: 'nii',
    label: 'NIfTI (.nii)',
    extension: '.nii',
    kind: 'itk',
    description:
      'NIfTI-1, the neuroimaging standard; the origin, spacing, and direction go into the qform and sform affines. ' +
      'Read by FSL, SPM, ANTs, and every viewer.',
  },
  {
    id: 'nii.gz',
    label: 'NIfTI compressed (.nii.gz)',
    extension: '.nii.gz',
    kind: 'itk',
    description: 'NIfTI-1 compressed with gzip, the form neuroimaging tools exchange most often.',
  },
  {
    id: 'mha',
    label: 'MetaImage (.mha)',
    extension: '.mha',
    kind: 'itk',
    description: 'MetaImage with the header and the raw pixels in one file, ITK’s native text-header format.',
  },
  {
    id: 'vtk',
    label: 'VTK (.vtk)',
    extension: '.vtk',
    kind: 'itk',
    description:
      'Legacy VTK structured points, for ParaView and VTK; keeps the origin and spacing but has no direction ' +
      'matrix.',
  },
  {
    id: 'hdf5',
    label: 'HDF5 (.hdf5)',
    extension: '.hdf5',
    kind: 'itk',
    description: 'ITK’s HDF5 image layout: the pixels and the geometry as datasets in an HDF5 container.',
  },
  {
    id: 'mgh',
    label: 'MGH (.mgh)',
    extension: '.mgh',
    kind: 'itk',
    description: 'FreeSurfer’s MGH volume format, with the geometry in its header.',
  },
  {
    id: 'mnc',
    label: 'MINC (.mnc)',
    extension: '.mnc',
    kind: 'itk',
    description: 'MINC 2, the HDF5-based volume format of the MNI tools.',
  },
  {
    id: 'mrc',
    label: 'MRC (.mrc)',
    extension: '.mrc',
    kind: 'itk',
    description:
      'MRC/CCP4 density map, as used in electron microscopy; keeps the spacing but neither the origin nor the ' +
      'direction.',
  },
  {
    id: 'gipl',
    label: 'GIPL (.gipl)',
    extension: '.gipl',
    kind: 'itk',
    description: 'Guy’s Image Processing Lab format, a simple header followed by the pixels.',
  },
  {
    id: 'pic',
    label: 'BioRad (.pic)',
    extension: '.pic',
    kind: 'itk',
    description: 'Bio-Rad PIC, the confocal microscope format.',
  },
  {
    id: 'aim',
    label: 'Scanco AIM (.aim)',
    extension: '.aim',
    kind: 'itk',
    description: 'Scanco AIM, the micro-CT format.',
  },
  {
    id: 'fdf',
    label: 'Varian FDF (.fdf)',
    extension: '.fdf',
    kind: 'itk',
    description: 'Varian FDF (flexible data format), one MRI image per file.',
  },
  {
    id: 'bmp',
    label: 'BMP (.bmp)',
    extension: '.bmp',
    kind: 'itk',
    description: 'Windows bitmap. Holds 2D 8-bit pixels only, so a 16-bit slice or a volume cannot be written.',
  },
  {
    id: 'jpg',
    label: 'JPEG (.jpg)',
    extension: '.jpg',
    kind: 'itk',
    description: 'JPEG, lossy. Holds 2D 8-bit pixels only, so a 16-bit slice or a volume cannot be written.',
  },
  {
    id: 'png',
    label: 'PNG (.png)',
    extension: '.png',
    kind: 'itk',
    description:
      'PNG, lossless. Holds 2D unsigned 8- or 16-bit pixels only, so a signed 16-bit CT slice or a volume cannot be ' +
      'written.',
  },
  {
    id: 'iwi.cbor',
    label: 'ITK-Wasm image (.iwi.cbor)',
    extension: '.iwi.cbor',
    kind: 'itk',
    description:
      'ITK-Wasm’s own CBOR image serialization, which itk-wasm reads back losslessly, direction included; encoded ' +
      'in the browser.',
  },
]

/**
 * Transform formats in picker order: the OME-Zarr RFC-5 transform-only OZX
 * (the default), the `@itk-wasm/transform-io` formats, and elastix's own
 * TransformParameters JSON. `tfm` is absent from transform-io's
 * extension table, so `writeTransform` probes each writer for it; ITK's text
 * transform writer accepts the extension. `h5` and `hdf5` share a writer.
 */
export const TRANSFORM_FORMATS: readonly TransformFormat[] = [
  {
    id: 'ozx-transform',
    label: 'OME-Zarr transform (.ome.zarr.ozx)',
    extension: '.ome.zarr.ozx',
    kind: 'ozx',
    description:
      'An OME-Zarr 0.6 group holding only the RFC-5 affine from the fixed to the moving coordinate system, zipped ' +
      'into one file (RFC-9). The same mapping the registered image’s OME-Zarr embeds.',
  },
  {
    id: 'h5',
    label: 'ITK HDF5 (.h5)',
    extension: '.h5',
    kind: 'itk',
    description:
      'ITK’s HDF5 transform file: one entry per elastix stage (affine, rigid, translation), the last applied first. ' +
      'Read by ITK, SimpleITK, and ANTs.',
  },
  {
    id: 'hdf5',
    label: 'ITK HDF5 (.hdf5)',
    extension: '.hdf5',
    kind: 'itk',
    description:
      'ITK’s HDF5 transform file under its longer extension: one entry per elastix stage, the last applied first.',
  },
  {
    id: 'tfm',
    label: 'ITK text (.tfm)',
    extension: '.tfm',
    kind: 'itk',
    description:
      'ITK’s text transform file: one entry per elastix stage, the last applied first. Read by ITK, SimpleITK, and ' +
      '3D Slicer.',
  },
  {
    id: 'txt',
    label: 'ITK text (.txt)',
    extension: '.txt',
    kind: 'itk',
    description:
      'ITK’s text transform file under a .txt extension: one entry per elastix stage, the last applied first.',
  },
  {
    id: 'mat',
    label: 'MATLAB (.mat)',
    extension: '.mat',
    kind: 'itk',
    description: 'MATLAB .mat file, the linear transform format ANTs writes and reads; one entry per elastix stage.',
  },
  {
    id: 'xfm',
    label: 'MINC XFM (.xfm)',
    extension: '.xfm',
    kind: 'itk',
    description:
      'MINC XFM, which holds a single 3D linear transform. This demo’s three-stage result cannot be written to it; ' +
      'choose another format.',
  },
  {
    id: 'iwt.cbor',
    label: 'ITK-Wasm transform (.iwt.cbor)',
    extension: '.iwt.cbor',
    kind: 'itk',
    description:
      'ITK-Wasm’s own CBOR transform serialization, one entry per elastix stage, which itk-wasm reads back as the ' +
      'same list.',
  },
  {
    id: 'elastix-json',
    label: 'elastix TransformParameters (.json)',
    extension: '.json',
    kind: 'json',
    description:
      'elastix’s own TransformParameters maps as JSON, one map per stage, which elastix and transformix read back ' +
      'as a parameter object.',
  },
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
