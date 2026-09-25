// Write the fixed-to-moving transform in the format the picker chose. Three
// writers, dispatched on the registry's `kind` (src/io/formats.ts):
//
// - `ozx`: the RFC-5 affine between the `fixed` and `moving` coordinate
//   systems, alone in an OME-Zarr 0.6 group zipped into an RFC-9 `.ozx`
//   (src/io/rfc5-transform.ts). It is the same mapping the registered
//   image's own OZX embeds, only with the fixed image's system named
//   explicitly since there is no image here for it to be intrinsic to.
// - `itk`: `@itk-wasm/transform-io`'s `writeTransform`, keyed on the file
//   extension (src/io/export.ts). elastix's list goes to the writer as it
//   is, so the file holds one ITK transform per stage in the list's order,
//   which is ITK's composite-queue order: affine, rigid, translation, the
//   last entry being the one applied first.
// - `json`: elastix's own transform parameter maps, pretty-printed, which
//   elastix or transformix can read back as a parameter object.
//
// The decisions (file names, the JSON bytes, which format refuses the list)
// live in src/io/export-plan.ts so the Node unit tests can cover them; this
// module is the wiring, and it reaches the ITK-Wasm writer's web worker
// through src/io/export.ts, so only the Playwright specs run it.
import { formatBytes } from '../format'
import { exportTransform } from './export'
import {
  elastixParametersJson,
  progressReporter,
  registrationOutputs,
  transformFilename,
  unsupportedTransformFormatReason,
  type ExportableState,
  type RegistrationOutputs,
} from './export-plan'
import type { ExportedFile, ExportProgressCallback } from './export-types'
import { transformFormatById } from './formats'
import { buildRfc5TransformSet, transformOnlyOzx } from './rfc5-transform'

export {
  TRANSFORM_PARAMETERS_STEM,
  TRANSFORM_STEM,
  transformFilename,
  unsupportedTransformFormatReason,
  type ExportableState,
} from './export-plan'
export type { ExportProgress, ExportProgressCallback, ExportRegisteredTransformFunction } from './export-types'

/**
 * Serialize the fixed-to-moving transform of the registration result in
 * `state` as the transform format `formatId` names (a registry id, typically
 * the picker's value) and return the bytes with the file name they should be
 * downloaded as. `onProgress` receives the `package` phase when writing
 * starts and `done` with the size; none of these writers counts anything,
 * so the counts are never set. Throws on an unknown format, on a state
 * without a result, on a format that cannot hold the elastix list (MINC
 * XFM), and on anything the writer refuses.
 */
export async function exportRegisteredTransform(
  state: ExportableState,
  formatId: string,
  onProgress?: ExportProgressCallback,
): Promise<ExportedFile> {
  const format = transformFormatById(formatId)
  const outputs = registrationOutputs(state)
  const filename = transformFilename(format)

  const reason = unsupportedTransformFormatReason(format, outputs.result.transform)
  if (reason !== undefined) {
    throw new Error(reason)
  }

  const report = progressReporter(onProgress)
  report('package', `Writing ${filename}…`)

  let bytes: Uint8Array
  switch (format.kind) {
    case 'ozx':
      bytes = writeOzx(outputs)
      break
    case 'json':
      bytes = elastixParametersJson(outputs.result.transformParameterObject)
      break
    case 'itk':
      bytes = (await exportTransform(outputs.result.transform, filename)).bytes
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
