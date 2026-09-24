// Human-readable summary of a loaded input image: the fields the splash
// dialog shows under each slot ({@link imageSummaryFields}), which the
// comparisons' "Image details" repeat with the source format and pixel
// budget added ({@link imageDetailFields}), or replace with the registered
// result's while the result comparison shows it ({@link panelDetails},
// {@link comparisonDetails}). Pure functions over `LoadedImage` and the app
// state, free of DOM access, so the Node unit tests cover them;
// src/ui/summary-list.ts renders the rows and src/ui/image-info.ts binds
// them to the comparisons.
import { formatBytes, formatElapsed } from '../format.ts'
import type { LoadedImage } from '../io/load-image.ts'
import { REGISTRATION_TIMEPOINT_INDEX } from '../io/normalize.ts'
import { AFFINE_STAGES_LABEL, type RegistrationResult } from '../registration/types.ts'
import { hasInputs, isShowingResult, RESULT_NAME, type AppState } from '../state.ts'
import {
  COMPARISON_SIDES,
  panelComparison,
  panelRole,
  panelSide,
  type ComparisonRole,
  type ComparisonSide,
  type DemoPanelRole,
} from '../viewer/comparison-options.ts'

/** One row of a summary: a stable key (the row's `data-field`), a label, and its value. */
export interface SummaryField {
  key: string
  label: string
  value: string
}

/** Extents joined with a multiplication sign: "256 × 256 × 128". */
export function formatShape(size: readonly number[]): string {
  return size.join(' × ')
}

/** Axis letters of an ITK-Wasm size or spacing array: "x × y" or "x × y × z". */
export function axisLabels(dimension: number): string {
  return ['x', 'y', 'z'].slice(0, dimension).join(' × ')
}

/** Spacing at four significant digits with trailing zeros dropped: "0.9766 × 0.9766". */
export function formatSpacing(spacing: readonly number[]): string {
  return spacing.map((value) => String(Number(value.toPrecision(4)))).join(' × ')
}

/** The part of a loaded image the scale fields need. */
export type ScaleInfo = Pick<LoadedImage, 'multiscales' | 'ngffImage' | 'scaleIndex'>

/**
 * Downsampling factor of the chosen pyramid level relative to level 0,
 * read from the ratio of their 'x' scale coefficients and rounded to one
 * decimal (an OME-TIFF level derives its spacing from the width ratio, so
 * the factor need not be an integer). Undefined at level 0 or when either
 * level lacks an 'x' scale.
 */
export function downsampleFactor(image: ScaleInfo): number | undefined {
  if (image.scaleIndex === 0) {
    return undefined
  }
  const base = image.multiscales.images[0]?.scale.x
  const chosen = image.ngffImage.scale.x
  if (!base || !chosen || !Number.isFinite(base) || !Number.isFinite(chosen)) {
    return undefined
  }
  return Math.round((chosen / base) * 10) / 10
}

/** "0 (full resolution)" or "1 (downsampled ÷2)". */
export function scaleUsedLabel(image: ScaleInfo): string {
  if (image.scaleIndex === 0) {
    return '0 (full resolution)'
  }
  const factor = downsampleFactor(image)
  return factor === undefined ? String(image.scaleIndex) : `${image.scaleIndex} (downsampled ÷${factor})`
}

/**
 * The summary rows for one loaded image, in display order: name,
 * dimension, shape at the chosen scale, data type, spacing, pyramid
 * levels, the scale used, and the bytes elastix receives. A channel, time
 * point, or squeezed-axis row follows only when the source had more than
 * one channel or time point, or was a single-slice volume.
 */
export function imageSummaryFields(image: LoadedImage): SummaryField[] {
  const { itkImage } = image
  const fields: SummaryField[] = [
    { key: 'name', label: 'Name', value: image.name },
    { key: 'dimension', label: 'Dimension', value: `${image.dimension}D` },
    { key: 'shape', label: `Shape (${axisLabels(image.dimension)})`, value: formatShape(itkImage.size) },
    { key: 'dtype', label: 'Data type', value: itkImage.imageType.componentType },
    { key: 'spacing', label: 'Spacing', value: formatSpacing(itkImage.spacing) },
    { key: 'levels', label: 'Pyramid levels', value: String(image.multiscales.images.length) },
    { key: 'scale', label: 'Scale used', value: scaleUsedLabel(image) },
    { key: 'bytes', label: 'Sent to elastix', value: formatBytes(image.registrationBytes) },
  ]
  if (image.channelCount > 1) {
    fields.push({ key: 'channel', label: 'Channel', value: `${image.channelIndex + 1} of ${image.channelCount}` })
  }
  if (image.timepointCount > 1) {
    fields.push({
      key: 'timepoint',
      label: 'Time point',
      value: `${REGISTRATION_TIMEPOINT_INDEX + 1} of ${image.timepointCount}`,
    })
  }
  if (image.squeezedAxis !== undefined) {
    fields.push({ key: 'squeezed', label: 'Squeezed', value: `single ${image.squeezedAxis} slice, registered as 2D` })
  }
  return fields
}

/** One-line form for status text: "2D 256 × 256 int16, 128.0 KB". */
export function shortSummary(image: LoadedImage): string {
  return `${image.dimension}D ${formatShape(image.itkImage.size)} ${image.itkImage.imageType.componentType}, ${formatBytes(image.registrationBytes)}`
}

/**
 * The rows a viewer panel's "Image details" shows for an input image: the
 * splash summary with the source format (ITK, OME-Zarr, OZX, TIFF,
 * OME-TIFF) after the name and the pixel budget scale selection used after
 * the bytes sent to elastix. The optional channel, time point, and
 * squeezed rows keep trailing the list.
 */
export function imageDetailFields(image: LoadedImage): SummaryField[] {
  const fields: SummaryField[] = []
  for (const field of imageSummaryFields(image)) {
    fields.push(field)
    if (field.key === 'name') {
      fields.push({ key: 'source', label: 'Source', value: image.format })
    } else if (field.key === 'bytes') {
      fields.push({ key: 'budget', label: 'Pixel budget', value: formatBytes(image.budgetBytes) })
    }
  }
  return fields
}

/** What the result comparison's moving side displays while the result switch is on. */
export const RESULT_DISPLAY_NOTE = 'Registered result on the fixed grid'

/**
 * The rows the result comparison's "Image details" shows for its moving
 * side while it displays the registered result: what is displayed, the
 * result's name and grid (the moving image resampled onto the fixed
 * image's), its dimension, shape, data type, and spacing, and the
 * transform stages and elapsed time.
 */
export function resultDetailFields(result: RegistrationResult, fixed: LoadedImage, moving: LoadedImage): SummaryField[] {
  const { image } = result
  const { dimension } = image.imageType
  return [
    { key: 'displaying', label: 'Displaying', value: RESULT_DISPLAY_NOTE },
    { key: 'name', label: 'Name', value: RESULT_NAME },
    { key: 'moving', label: 'Moving image', value: moving.name },
    { key: 'grid', label: 'Resampled onto', value: `${fixed.name} (fixed grid)` },
    { key: 'dimension', label: 'Dimension', value: `${dimension}D` },
    { key: 'shape', label: `Shape (${axisLabels(dimension)})`, value: formatShape(image.size) },
    { key: 'dtype', label: 'Data type', value: image.imageType.componentType },
    { key: 'spacing', label: 'Spacing', value: formatSpacing(image.spacing) },
    { key: 'transform', label: 'Transform', value: AFFINE_STAGES_LABEL },
    { key: 'elapsed', label: 'Registered in', value: formatElapsed(result.elapsedMs) },
  ]
}

/** One-line form of the result for the details' summary row: "3D 128 × 96 × 64 float32 on the fixed grid". */
export function resultBrief(result: RegistrationResult): string {
  const { image } = result
  return `${image.imageType.dimension}D ${formatShape(image.size)} ${image.imageType.componentType} on the fixed grid`
}

/** Which of the app's images a viewer panel displays. */
export type PanelContentKind = 'fixed' | 'moving' | 'result'

/** The heading over a side's rows in the details: "Fixed", "Moving", or "Registered". */
export function contentTitle(content: PanelContentKind): string {
  return content === 'fixed' ? 'Fixed' : content === 'moving' ? 'Moving' : 'Registered'
}

/** What a panel's "Image details" shows: the content, a one-line brief for the summary row, and the rows. */
export interface PanelDetails {
  content: PanelContentKind
  brief: string
  fields: SummaryField[]
}

/**
 * The details for one panel, following the same rule as `panelContent` in
 * src/viewer/comparison-options.ts: a fixed side describes the fixed
 * input; the result comparison's moving side describes the registered
 * result while it is shown (both inputs are then loaded too); any other
 * moving side describes the moving input. Undefined while the panel is
 * empty.
 */
export function panelDetails(state: Readonly<AppState>, role: DemoPanelRole): PanelDetails | undefined {
  const side = panelSide(role)
  if (side === 'moving' && panelComparison(role) === 'result' && isShowingResult(state) && hasInputs(state)) {
    return {
      content: 'result',
      brief: resultBrief(state.result!),
      fields: resultDetailFields(state.result!, state.fixed, state.moving),
    }
  }
  const image = state[side]
  if (image === undefined) {
    return undefined
  }
  return { content: side, brief: shortSummary(image), fields: imageDetailFields(image) }
}

/** What a comparison's "Image details" shows: the details of each side and one line naming both for the summary row. */
export interface ComparisonDetails {
  sides: Readonly<Record<ComparisonSide, PanelDetails>>
  /** "Fixed 2D 512 × 512 int16, 512.0 KB · Moving 2D 512 × 512 int16, 512.0 KB". */
  brief: string
}

/**
 * The details for one comparison: {@link panelDetails} of both its sides.
 * Undefined while either side is empty, which is both, since the inputs
 * load as a pair.
 */
export function comparisonDetails(state: Readonly<AppState>, comparison: ComparisonRole): ComparisonDetails | undefined {
  const fixed = panelDetails(state, panelRole(comparison, 'fixed'))
  const moving = panelDetails(state, panelRole(comparison, 'moving'))
  if (fixed === undefined || moving === undefined) {
    return undefined
  }
  const sides = { fixed, moving }
  return {
    sides,
    brief: COMPARISON_SIDES.map((side) => `${contentTitle(sides[side].content)} ${sides[side].brief}`).join(' · '),
  }
}
