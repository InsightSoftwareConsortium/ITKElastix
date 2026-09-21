// Names and types shared by the ITK-Wasm export code (src/io/export.ts) and
// the modules that only drive the UI or run under node, such as
// src/ui/download-flow.ts and its tests. Nothing here imports an ITK-Wasm
// pipeline package (and its web worker), so those modules stay free of it.
import type { Image, TransformList } from 'itk-wasm'

/** File name the registered result image is downloaded as. */
export const RESULT_IMAGE_FILENAME = 'registered.nrrd'

/** File name the fixed-to-moving transform is downloaded as. */
export const TRANSFORM_FILENAME = 'transform.h5'

/** A file serialized in memory, ready to download. */
export interface ExportedFile {
  filename: string
  bytes: Uint8Array
}

/** Signature of {@link exportImage}, for injecting a stand-in. */
export type ExportImageFunction = (image: Image, filename?: string) => Promise<ExportedFile>

/** Signature of {@link exportTransform}, for injecting a stand-in. */
export type ExportTransformFunction = (transform: TransformList, filename?: string) => Promise<ExportedFile>
