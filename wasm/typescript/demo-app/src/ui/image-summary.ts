// Human-readable summary of a loaded input image: the fields the splash
// dialog shows under each slot, which the viewer panels' "Image details"
// repeat. Pure functions over `LoadedImage`, free of DOM access, so the
// Node unit tests cover them; src/ui/summary-list.ts renders the rows.
import { formatBytes } from '../format.ts'
import type { LoadedImage } from '../io/load-image.ts'
import { REGISTRATION_TIMEPOINT_INDEX } from '../io/normalize.ts'

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
