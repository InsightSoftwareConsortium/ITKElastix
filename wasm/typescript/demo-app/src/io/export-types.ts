// Names and types shared by the ITK-Wasm export code (src/io/export.ts,
// src/io/export-image.ts, src/io/export-transform.ts) and the modules that
// only drive the UI or run under node, such as src/ui/download-flow.ts and
// its tests. Nothing here imports an ITK-Wasm pipeline package (and its web
// worker), so those modules stay free of it.
import type { ExportableState } from './export-plan.ts'

/** File name `exportImage` writes by default: the registered image as NRRD. */
export const RESULT_IMAGE_FILENAME = 'registered.nrrd'

/** File name `exportTransform` writes by default: the transform as ITK HDF5. */
export const TRANSFORM_FILENAME = 'transform.h5'

/** A file serialized in memory, ready to download. */
export interface ExportedFile {
  filename: string
  bytes: Uint8Array
}

/**
 * Coarse phases of one export, in order: the ITK-Wasm image becoming an
 * OME-Zarr array (`convert`), the pyramid being built (`downsample`), the
 * file being written (`package`, the only phase that reports counts), and
 * the bytes being ready (`done`). An ITK-Wasm format skips straight to
 * `package`.
 */
export type ExportStage = 'convert' | 'downsample' | 'package' | 'done'

export interface ExportProgress {
  stage: ExportStage
  message: string
  /** Units written so far: OME-Zarr chunks or OME-TIFF planes. Only while packaging. */
  completed?: number
  /** Units to write in total; reported together with `completed`. */
  total?: number
}

export type ExportProgressCallback = (progress: ExportProgress) => void

/**
 * Signature shared by the two registry-driven exporters: the state holding
 * the result and its inputs, a format id from src/io/formats.ts (typically a
 * picker's value), and an optional progress callback.
 */
export type ExportRegisteredFunction = (
  state: ExportableState,
  formatId: string,
  onProgress?: ExportProgressCallback,
) => Promise<ExportedFile>

/** Signature of `exportRegisteredImage` (src/io/export-image.ts), for injecting a stand-in. */
export type ExportRegisteredImageFunction = ExportRegisteredFunction

/** Signature of `exportRegisteredTransform` (src/io/export-transform.ts), for injecting a stand-in. */
export type ExportRegisteredTransformFunction = ExportRegisteredFunction
