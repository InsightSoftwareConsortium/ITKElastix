// The Download image and Download transform buttons' behaviour: serialize
// the registration result with the injected exporters while the status row
// shows an indeterminate progress bar, hand the bytes to the injected
// download function, and report the outcome in the status row.
//
// The exporters and the download function are injected so this module never
// imports the ITK-Wasm writers or touches the DOM; the node unit tests drive
// it with stand-ins.
import { formatBytes } from '../format.ts'
import type { DownloadFunction } from '../io/download.ts'
import {
  RESULT_IMAGE_FILENAME,
  TRANSFORM_FILENAME,
  type ExportedFile,
  type ExportImageFunction,
  type ExportTransformFunction,
} from '../io/export-types.ts'
import type { RegistrationResult } from '../registration/types.ts'
import { hasResult, type AppStore } from '../state.ts'
import type { Shell } from './shell.ts'

export interface DownloadFlowOptions {
  /** Serializes the result image; `exportImage` in the app. */
  exportImage: ExportImageFunction
  /** Serializes the transform; `exportTransform` in the app. */
  exportTransform: ExportTransformFunction
  /** Saves the bytes; `downloadBytes` in the app. */
  download: DownloadFunction
}

export type DownloadFlowShell = Pick<Shell, 'setStatus'>

export interface DownloadFlow {
  /** Action behind the Download image button. */
  downloadImage(): Promise<void>
  /** Action behind the Download transform button. */
  downloadTransform(): Promise<void>
}

type DownloadKind = 'image' | 'transform'

/**
 * Returns the actions behind the two download buttons. Calling one without
 * a result, or while its own download is still being written, does nothing;
 * the two kinds may run at the same time.
 */
export function createDownloadFlow(
  store: AppStore,
  shell: DownloadFlowShell,
  { exportImage, exportTransform, download }: DownloadFlowOptions,
): DownloadFlow {
  const writing = new Set<DownloadKind>()

  async function save(
    kind: DownloadKind,
    filename: string,
    produce: (result: RegistrationResult) => Promise<ExportedFile>,
  ): Promise<void> {
    const { state } = store
    if (!hasResult(state) || writing.has(kind)) {
      return
    }
    writing.add(kind)
    shell.setStatus({ message: `Writing ${filename}…`, busy: true })
    try {
      const file = await produce(state.result)
      download(file.bytes, file.filename)
      shell.setStatus({ message: `Downloaded ${file.filename} (${formatBytes(file.bytes.byteLength)}).` })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      shell.setStatus({ message: `Could not write ${filename}: ${reason}`, variant: 'danger' })
    } finally {
      writing.delete(kind)
    }
  }

  return {
    downloadImage: () => save('image', RESULT_IMAGE_FILENAME, (result) => exportImage(result.image, RESULT_IMAGE_FILENAME)),
    downloadTransform: () =>
      save('transform', TRANSFORM_FILENAME, (result) => exportTransform(result.transform, TRANSFORM_FILENAME)),
  }
}
