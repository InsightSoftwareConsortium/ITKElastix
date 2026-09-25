// The Download image and Download transform buttons' behaviour: serialize
// the registration result in the format the store has chosen with the
// injected exporters, drive the status row (message and progress bar) from
// the exporter's progress, mark the output as being written in the store
// (which the shell renders as the button's spinner), hand the bytes to the
// injected download function, and report the outcome in the status row.
//
// The exporters and the download function are injected so this module never
// imports the ITK-Wasm writers or touches the DOM; the node unit tests drive
// it with stand-ins.
import { formatBytes } from '../format.ts'
import type { DownloadFunction } from '../io/download.ts'
import { resultFilename, transformFilename } from '../io/export-plan.ts'
import type {
  ExportProgress,
  ExportRegisteredFunction,
  ExportRegisteredImageFunction,
  ExportRegisteredTransformFunction,
} from '../io/export-types.ts'
import { imageFormatById, transformFormatById } from '../io/formats.ts'
import {
  canDownload,
  selectedFormatId,
  writingFinished,
  writingStarted,
  type AppStore,
  type OutputKind,
} from '../state.ts'
import type { FormatChoices } from './download-controls.ts'
import { errorMessage } from './notify-options.ts'
import type { Shell, StatusOptions } from './shell.ts'

export interface DownloadFlowOptions {
  /** Serializes the result image; `exportRegisteredImage` in the app. */
  exportImage: ExportRegisteredImageFunction
  /** Serializes the transform; `exportRegisteredTransform` in the app. */
  exportTransform: ExportRegisteredTransformFunction
  /** Saves the bytes; `downloadBytes` in the app. */
  download: DownloadFunction
}

export type DownloadFlowShell = Pick<Shell, 'setStatus'>

export interface DownloadFlow {
  /** Action behind the download button for `kind`. */
  download(kind: OutputKind): Promise<void>
  /** Action behind the Download image button. */
  downloadImage(): Promise<void>
  /** Action behind the Download transform button. */
  downloadTransform(): Promise<void>
}

/**
 * File name the download of `kind` gets in the format `state` has chosen:
 * the name the exporter will give it, known up front so the status row can
 * name the file while it is being written.
 */
export function plannedFilename(state: FormatChoices, kind: OutputKind): string {
  return kind === 'image'
    ? resultFilename(imageFormatById(state.imageFormat))
    : transformFilename(transformFormatById(state.transformFormat))
}

/**
 * Status row content for one exporter progress report: its message with
 * the progress bar showing, determinate when the report counts chunks or
 * planes against a total and indeterminate otherwise (the OME-Zarr writer's
 * `package` phase opens with a total of zero, and the ITK-Wasm writers
 * count nothing).
 */
export function exportStatus(progress: ExportProgress): StatusOptions {
  const { completed, total } = progress
  const status: StatusOptions = { message: progress.message, busy: true }
  if (completed !== undefined && total !== undefined && total > 0) {
    status.progress = { completed, total }
  }
  return status
}

/**
 * Returns the actions behind the two download buttons. Calling one without
 * a result, or while its own output is still being written, does nothing;
 * the two kinds may run at the same time. The state captured at the click
 * is what gets written, so a pair loaded meanwhile does not change the
 * file, and a writer failure ends in a danger callout with the button
 * usable again.
 */
export function createDownloadFlow(
  store: AppStore,
  shell: DownloadFlowShell,
  { exportImage, exportTransform, download }: DownloadFlowOptions,
): DownloadFlow {
  const exporters: Readonly<Record<OutputKind, ExportRegisteredFunction>> = {
    image: exportImage,
    transform: exportTransform,
  }

  async function save(kind: OutputKind): Promise<void> {
    const { state } = store
    if (!canDownload(state, kind)) {
      return
    }
    const filename = plannedFilename(state, kind)
    store.update(writingStarted(kind))
    shell.setStatus({ message: `Writing ${filename}…`, busy: true })
    try {
      const file = await exporters[kind](state, selectedFormatId(state, kind), (progress) => {
        // `done` is followed at once by the download report below.
        if (progress.stage !== 'done') {
          shell.setStatus(exportStatus(progress))
        }
      })
      download(file.bytes, file.filename)
      shell.setStatus({ message: `Downloaded ${file.filename} (${formatBytes(file.bytes.byteLength)}).` })
    } catch (error) {
      shell.setStatus({ message: `Could not write ${filename}: ${errorMessage(error)}`, variant: 'danger' })
    } finally {
      store.update(writingFinished(kind))
    }
  }

  return {
    download: save,
    downloadImage: () => save('image'),
    downloadTransform: () => save('transform'),
  }
}
