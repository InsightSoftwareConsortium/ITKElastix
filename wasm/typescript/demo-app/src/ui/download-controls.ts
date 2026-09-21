// The decisions behind the download controls of the shell (src/ui/shell.ts):
// which formats each picker lists, which one the state has chosen, the text
// of the tooltip on each download button, and the percentage a determinate
// progress bar is drawn at. Pure functions over the registry and the state,
// free of DOM access, so the node unit tests can cover them.
import {
  IMAGE_FORMATS,
  TRANSFORM_FORMATS,
  imageFormatById,
  transformFormatById,
  type ImageFormat,
  type TransformFormat,
} from '../io/formats.ts'
import type { AppState, OutputKind } from '../state.ts'

/** An entry of either picker. */
export type AnyOutputFormat = ImageFormat | TransformFormat

/** The parts of the state the pickers read. */
export type FormatChoices = Readonly<Pick<AppState, 'imageFormat' | 'transformFormat'>>

/** The formats the picker for `kind` lists, in order. */
export function pickerFormats(kind: OutputKind): readonly AnyOutputFormat[] {
  return kind === 'image' ? IMAGE_FORMATS : TRANSFORM_FORMATS
}

/** The format `state` has chosen for `kind`. */
export function selectedFormat(state: FormatChoices, kind: OutputKind): AnyOutputFormat {
  return kind === 'image' ? imageFormatById(state.imageFormat) : transformFormatById(state.transformFormat)
}

/** What the download button for `kind` writes, as named in its tooltip. */
const OUTPUT_SUBJECTS: Readonly<Record<OutputKind, string>> = {
  image: 'the registered image',
  transform: 'the fixed-to-moving transform',
}

/**
 * Text of the tooltip on the download button for `kind` while `format` is
 * chosen: what the click writes, then the registry's description of the
 * format, so the tooltip follows the picker.
 */
export function formatTooltip(kind: OutputKind, format: Pick<AnyOutputFormat, 'label' | 'description'>): string {
  return `Download ${OUTPUT_SUBJECTS[kind]} as ${format.label}. ${format.description}`
}

/** Counts a determinate progress bar is drawn from. */
export interface ProgressCounts {
  completed: number
  total: number
}

/**
 * Percentage, 0 to 100, that `counts` fill the bar to. Zero when there is no
 * total to measure against (the OME-Zarr writer's first report), and never
 * outside the bar's range however the counts arrive.
 */
export function progressPercent({ completed, total }: ProgressCounts): number {
  if (!(total > 0) || !Number.isFinite(completed)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round((100 * completed) / total)))
}
