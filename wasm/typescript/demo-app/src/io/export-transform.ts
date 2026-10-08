// Write the fixed-to-moving transform in the format the picker chose. Four
// writers, dispatched on the registry's `kind` (src/io/formats.ts):
//
// - `ozx`: the RFC-5 transform between the `fixed` and `moving` coordinate
//   systems, a sequence of the translation, rigid, and affine stages, alone
//   in an OME-Zarr 0.6 group zipped into an RFC-9 `.ozx`
//   (src/io/rfc5-transform.ts). It is the same mapping the registered
//   image's own OZX embeds, only with the fixed image's system named
//   explicitly since there is no image here for it to be intrinsic to.
// - `scene`: the same mapping in an OME-Zarr 0.6 scene zipped into an RFC-9
//   `.ozx` by ngff-zarr's `toOmeZarrOzx`, together with the two images it
//   maps between: the fixed and moving images as elastix registered them,
//   each an OME-Zarr pyramid below the scene group, with the transform
//   running from the fixed image's intrinsic coordinate system to the
//   moving image's.
// - `itk`: `@itk-wasm/transform-io`'s `writeTransform`, keyed on the file
//   extension (src/io/export.ts). elastix's list goes to the writer as it
//   is, so the file holds one ITK transform per stage in the list's order,
//   which is ITK's composite-queue order: affine, rigid, translation, the
//   last entry being the one applied first. MINC XFM holds a single 3D
//   linear transform, so its writer gets the stages multiplied out into one
//   affine instead, lifted into 3D for a 2D registration.
// - `toml`: elastix's own TransformParameters files in the TOML format,
//   written by `@itk-wasm/elastix`'s `writeParameterFiles`, one per stage and
//   each chained to the one before, zipped (src/io/export.ts). elastix and
//   transformix read them back.
//
// The decisions (file names, the zip, the list each writer is given, the
// axis metadata of the scene's images) live in src/io/export-plan.ts so the
// Node unit tests can cover them; this module is the wiring, and it reaches
// the ITK-Wasm writers' web workers through src/io/export.ts and ngff-zarr's
// browser writer, so only the Playwright specs run it.
import { itkImageToNgffImage, NgffImage, toOmeZarrOzx, type Multiscales } from '@fideus-labs/ngff-zarr/browser'

import { formatBytes } from '../format'
import { exportElastixParameterFiles, exportTransform } from './export'
import { buildExportPyramid } from './export-image'
import {
  axisMetadataFor,
  exportScaleFactors,
  progressReporter,
  registrationOutputs,
  transformFilename,
  transformForFormat,
  type ExportableState,
  type ProgressReporter,
  type RegistrationOutputs,
} from './export-plan'
import type { ExportedFile, ExportProgressCallback } from './export-types'
import { stripImageExtension, transformFormatById } from './formats'
import { INGEST_CHUNK_SIZE, type LoadedImage } from './load-image'
import {
  buildRfc5TransformSet,
  buildScene,
  transformOnlyOzx,
  TRANSFORM_OME_ZARR_VERSION,
  type SceneRole,
} from './rfc5-transform'

export {
  TRANSFORM_PARAMETERS_STEM,
  TRANSFORM_STEM,
  transformFilename,
  transformForFormat,
  type ExportableState,
} from './export-plan'
export type { ExportProgress, ExportProgressCallback, ExportRegisteredTransformFunction } from './export-types'

/**
 * Serialize the fixed-to-moving transform of the registration result in
 * `state` as the transform format `formatId` names (a registry id, typically
 * the picker's value) and return the bytes with the file name they should be
 * downloaded as. `onProgress` receives the `package` phase when writing
 * starts and `done` with the size; for the scene, the `convert` and
 * `downsample` phases of each image come first, and its `package` phase
 * counts the chunks written across both images. The other writers count
 * nothing, so their counts are never set.
 * Throws on an unknown format, on a state without a result, on a list MINC
 * XFM cannot hold (a stage that is not linear), and on anything the writer
 * refuses.
 */
export async function exportRegisteredTransform(
  state: ExportableState,
  formatId: string,
  onProgress?: ExportProgressCallback,
): Promise<ExportedFile> {
  const format = transformFormatById(formatId)
  const outputs = registrationOutputs(state)
  const filename = transformFilename(format)

  // Before any progress is reported, so a list MINC XFM cannot hold fails at once.
  const transform = transformForFormat(format, outputs.result.transform)

  const report = progressReporter(onProgress)
  // The scene writer converts its images first and reports each phase itself.
  if (format.kind !== 'scene') {
    report('package', `Writing ${filename}…`)
  }

  let bytes: Uint8Array
  switch (format.kind) {
    case 'ozx':
      bytes = writeOzx(outputs)
      break
    case 'scene':
      bytes = await writeScene(outputs, report)
      break
    case 'toml':
      bytes = (await exportElastixParameterFiles(outputs.result.transformParameterObject, filename)).bytes
      break
    case 'itk':
      bytes = (await exportTransform(transform, filename)).bytes
      break
  }
  report('done', `Wrote ${filename} (${formatBytes(bytes.byteLength)})`)
  return { filename, bytes }
}

/**
 * The `ozx` writer: the standalone form of the RFC-5 transform set, between
 * the systems named `fixed` and `moving`, as a transform-only store. The
 * list is prepared (composite marker dropped, zero-count fields typed,
 * angle-parameterized stages rewritten as affines) inside the builder.
 */
function writeOzx({ fixed, moving, result }: RegistrationOutputs): Uint8Array {
  const transforms = buildRfc5TransformSet(result.transform, fixed, moving)
  return transformOnlyOzx(transforms.standalone, transforms.fixedSystem, transforms.movingSystem)
}

/**
 * The `scene` writer: both inputs as images of their own
 * ({@link sceneImage}) and the staged transform between their intrinsic
 * systems, as an `NgffScene` (`buildScene`) that ngff-zarr's `toOmeZarrOzx`
 * writes and zips, its images sharded as the registered image's OZX is and
 * its chunks counted for progress across both images. The transform is
 * built first, so a list ngff-zarr cannot convert fails before any image is
 * converted.
 */
async function writeScene({ fixed, moving, result }: RegistrationOutputs, report: ProgressReporter): Promise<Uint8Array> {
  const transforms = buildRfc5TransformSet(result.transform, fixed, moving)
  const scene = buildScene(transforms.scene, {
    fixed: await sceneImage(fixed, 'fixed', report),
    moving: await sceneImage(moving, 'moving', report),
  })

  report('package', 'Writing the OME-Zarr scene…', { completed: 0, total: 0 })
  return toOmeZarrOzx(scene, {
    version: TRANSFORM_OME_ZARR_VERSION,
    onProgress: (completed, total) => {
      report('package', `Writing OME-Zarr scene chunk ${completed} of ${total}…`, { completed, total })
    },
  })
}

/**
 * One input as an image of the scene: the scalar 2D or 3D image elastix
 * registered, named after the input file, with the axis units and RFC-4
 * orientations of the level it was cut from ({@link axisMetadataFor}). Its
 * origin and spacing are that level's too, since ingest copied them into the
 * ITK-Wasm image, so the image's intrinsic system is the frame the
 * transform's stages were converted for. The pyramid follows the registered
 * image's rule (`exportScaleFactors`), which keeps a level that fits the
 * input's budget, as this one does, at full resolution alone.
 */
async function sceneImage(input: LoadedImage, role: SceneRole, report: ProgressReporter): Promise<Multiscales> {
  const subject = `the ${role} image`
  report('convert', `Converting ${subject} to OME-Zarr…`)
  // The orientations come from the source level below, not from the
  // direction matrix ingest folded them into.
  const base = await itkImageToNgffImage(input.itkImage, { addAnatomicalOrientation: false, chunks: INGEST_CHUNK_SIZE })
  const image = new NgffImage({
    ...base,
    name: stripImageExtension(input.name),
    ...axisMetadataFor(input.ngffImage, base.dims),
  })
  return buildExportPyramid(image, exportScaleFactors(image, input.budgetBytes), report, subject)
}
