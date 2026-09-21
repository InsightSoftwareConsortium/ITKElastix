// Serialize the registration outputs to file bytes with ITK-Wasm's writers.
// The file format follows from the file name's extension (NRRD and ITK HDF5
// for the prototype; Phase 03 adds a format list). Each write runs in its
// own itk-wasm web worker, which is terminated once the bytes are back.
import { writeImage } from '@itk-wasm/image-io'
import { writeTransform } from '@itk-wasm/transform-io'
import { createWebWorker, type Image, type TransformList } from 'itk-wasm'

import { toPlainUint8Array } from './bytes'
import { toWriterError } from './export-plan'
import { RESULT_IMAGE_FILENAME, TRANSFORM_FILENAME, type ExportedFile } from './export-types'
import { withTypedParameterArrays } from './transform-list'

export {
  RESULT_IMAGE_FILENAME,
  TRANSFORM_FILENAME,
  type ExportedFile,
  type ExportImageFunction,
  type ExportTransformFunction,
} from './export-types'

/**
 * Write `image` in the format `filename`'s extension selects and return the
 * file bytes. itk-wasm posts a copy of the pixel buffer to the worker, so
 * `image` stays usable afterwards. The bytes are copied onto a plain,
 * exactly-sized `ArrayBuffer` before the worker is terminated: the pipeline
 * can hand back a view onto a shared or larger buffer, which `Blob` rejects
 * or would leak surrounding bytes into the file. A rejection is normalised
 * with `toWriterError`, so a wasm exception pointer becomes a message.
 */
export async function exportImage(image: Image, filename: string = RESULT_IMAGE_FILENAME): Promise<ExportedFile> {
  const webWorker = await createWebWorker()
  try {
    const { serializedImage } = await writeImage(image, filename, { webWorker }).catch((error: unknown) => {
      throw toWriterError(error, filename)
    })
    return { filename, bytes: toPlainUint8Array(serializedImage.data) }
  } finally {
    webWorker.terminate()
  }
}

/**
 * Write `transform` in the format `filename`'s extension selects and return
 * the file bytes. The list may start with elastix's `Composite` marker;
 * itk-wasm skips its (address-string) parameters when posting the list, and
 * ITK drops the marker and writes the stages that follow as a flat sequence
 * of transforms (`#Transform 0`, `#Transform 1`, … in the text format, with
 * no CompositeTransform wrapper), which its readers return as a list in the
 * same order. Zero-count parameter fields are given empty typed arrays first
 * (see `withTypedParameterArrays`), or the writer rejects the list. `tfm` is
 * absent from transform-io's extension table, so the writer probes each
 * format for it and ITK's text writer takes it.
 */
export async function exportTransform(
  transform: TransformList,
  filename: string = TRANSFORM_FILENAME,
): Promise<ExportedFile> {
  const webWorker = await createWebWorker()
  try {
    const { serializedTransform } = await writeTransform(withTypedParameterArrays(transform), filename, {
      webWorker,
    }).catch((error: unknown) => {
      throw toWriterError(error, filename, 'transform')
    })
    return { filename, bytes: toPlainUint8Array(serializedTransform.data) }
  } finally {
    webWorker.terminate()
  }
}
