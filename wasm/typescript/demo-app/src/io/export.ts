// Serialize the registration outputs to file bytes with ITK-Wasm's writers.
// The file format follows from the file name's extension (NRRD and ITK HDF5
// for the prototype; Phase 03 adds a format list). Each write runs in its
// own itk-wasm web worker, which is terminated once the bytes are back.
import { writeImage } from '@itk-wasm/image-io'
import { writeTransform } from '@itk-wasm/transform-io'
import { createWebWorker, type Image, type TransformList } from 'itk-wasm'

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
 * `image` stays usable afterwards.
 */
export async function exportImage(image: Image, filename: string = RESULT_IMAGE_FILENAME): Promise<ExportedFile> {
  const webWorker = await createWebWorker()
  try {
    const { serializedImage } = await writeImage(image, filename, { webWorker })
    return { filename, bytes: serializedImage.data }
  } finally {
    webWorker.terminate()
  }
}

/**
 * Write `transform` in the format `filename`'s extension selects and return
 * the file bytes. The list may start with elastix's `Composite` marker;
 * itk-wasm skips its (address-string) parameters when posting the list, and
 * ITK writes the stages that follow as one composite transform. Zero-count
 * parameter fields are given empty typed arrays first (see
 * `withTypedParameterArrays`), or the writer rejects the list.
 */
export async function exportTransform(
  transform: TransformList,
  filename: string = TRANSFORM_FILENAME,
): Promise<ExportedFile> {
  const webWorker = await createWebWorker()
  try {
    const { serializedTransform } = await writeTransform(withTypedParameterArrays(transform), filename, { webWorker })
    return { filename, bytes: serializedTransform.data }
  } finally {
    webWorker.terminate()
  }
}
