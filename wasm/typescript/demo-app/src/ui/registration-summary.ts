// The content of the registration summary card (src/ui/registration-
// panel.ts): the stages and resolutions the run used, how long it took, and
// the fixed-to-moving affine as a matrix and offset, computed from the
// result's `TransformList` with ngff-zarr's `itkTransformToNgffMatrix` over
// the fixed image's axes with both images as frames, which is the same
// conversion the OME-Zarr transform download writes (src/io/rfc5-
// transform.ts), so the numbers on screen are the numbers in the file. Also
// the elastix parameter JSON the card's copy button puts on the clipboard.
// Pure functions over the result and the two inputs, free of DOM access, so
// the node unit tests cover them.
//
// The bare `@fideus-labs/ngff-zarr` specifier serves Node and the browser
// alike; `itkTransformToNgffMatrix` is exported by both entries (see the
// note in src/io/rfc5-transform.ts).
import { itkTransformToNgffMatrix } from '@fideus-labs/ngff-zarr'

import { formatElapsed } from '../format.ts'
import { elastixParametersText } from '../io/export-plan.ts'
import { registrationDims, type TransformFrame } from '../io/rfc5-transform.ts'
import { withAffineStages, withoutCompositeHeader, withTypedParameterArrays } from '../io/transform-list.ts'
import { AFFINE_STAGES_LABEL, type RegistrationResult } from '../registration/types.ts'
import type { SummaryField } from './image-summary.ts'

/** What the summary card shows for one registration. */
export interface RegistrationSummary {
  /** The stage sequence, as labelled in the status row. */
  stages: string
  /** Pyramid levels per stage, when the run built the default maps. */
  resolutions?: number
  /** Wall-clock time of the run, formatted. */
  elapsed: string
  /** Axis names of the matrix's rows and columns, in OME-Zarr (RFC-5) order. */
  dims: string[]
  /** The linear part of the fixed-to-moving affine, row-major over `dims`. */
  matrix: number[][]
  /** The translation of the fixed-to-moving affine, over `dims`. */
  offset: number[]
  /** The elastix transform parameter maps as JSON text. */
  parametersText: string
}

/**
 * The summary of `result`, computed from the fixed and moving inputs it was
 * registered on. The list is prepared as the OME-Zarr writer prepares it:
 * elastix's `Composite` header dropped, zero-count parameter fields typed,
 * and the rigid stage rewritten as an affine so ngff-zarr can decode it.
 */
export function summarizeRegistration(
  result: RegistrationResult,
  fixed: TransformFrame,
  moving: TransformFrame,
): RegistrationSummary {
  const dims = registrationDims(fixed.dimension)
  const { matrix, offset } = itkTransformToNgffMatrix(
    withAffineStages(withTypedParameterArrays(withoutCompositeHeader(result.transform))),
    dims,
    { fixed: fixed.ngffImage, moving: moving.ngffImage },
  )
  return {
    stages: AFFINE_STAGES_LABEL,
    resolutions: result.numberOfResolutions,
    elapsed: formatElapsed(result.elapsedMs),
    dims,
    matrix,
    offset,
    parametersText: elastixParametersText(result.transformParameterObject),
  }
}

/** Decimal places a matrix or offset entry is shown with. */
export const MATRIX_DECIMALS = 4

/**
 * A matrix or offset entry rounded to {@link MATRIX_DECIMALS} places with
 * trailing zeros dropped, so the entries of a near-identity matrix line up
 * and a rounding residue reads as 0 rather than as `-1e-9`; a value that is
 * not finite is shown as is so a bad transform is visible rather than
 * hidden.
 */
export function formatMatrixValue(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value)
  }
  const rounded = Number(value.toFixed(MATRIX_DECIMALS))
  return String(rounded === 0 ? 0 : rounded)
}

/** The rows of the card's summary list: stages, resolutions (when known), elapsed time, and the axes. */
export function summaryFields(summary: RegistrationSummary): SummaryField[] {
  const fields: SummaryField[] = [{ key: 'stages', label: 'Stages', value: summary.stages }]
  if (summary.resolutions !== undefined) {
    fields.push({ key: 'resolutions', label: 'Resolutions per stage', value: String(summary.resolutions) })
  }
  fields.push(
    { key: 'elapsed', label: 'Registered in', value: summary.elapsed },
    { key: 'axes', label: 'Axes (OME-Zarr order)', value: summary.dims.join(', ') },
  )
  return fields
}

/** One line for the card's header: "translation → rigid → affine in 1.2 s". */
export function summaryBrief(summary: RegistrationSummary): string {
  return `${summary.stages} in ${summary.elapsed}`
}
