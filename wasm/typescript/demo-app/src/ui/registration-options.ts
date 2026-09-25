// The decisions behind the "Registration options" details of the
// registration panel (src/ui/registration-panel.ts): the range the
// resolutions picker offers, the pixel budgets the budget picker lists, how
// a picker value becomes a state value, and how a budget is labelled. Pure
// functions free of DOM access, so the node unit tests can cover them;
// src/state.ts takes `clampResolutions` from here, so this module must not
// import the store.
import { formatBytes } from '../format.ts'
import { PIXEL_BUDGET_BYTES } from '../io/scale-select.ts'
import { DEFAULT_NUMBER_OF_RESOLUTIONS } from '../registration/types.ts'

/** Fewest pyramid levels a stage may be optimized over. */
export const MIN_NUMBER_OF_RESOLUTIONS = 2

/** Most pyramid levels a stage may be optimized over. */
export const MAX_NUMBER_OF_RESOLUTIONS = 5

/** The resolutions picker's entries, ascending: 2, 3, 4, 5. */
export const RESOLUTION_OPTIONS: readonly number[] = Array.from(
  { length: MAX_NUMBER_OF_RESOLUTIONS - MIN_NUMBER_OF_RESOLUTIONS + 1 },
  (_, index) => MIN_NUMBER_OF_RESOLUTIONS + index,
)

/**
 * The number of resolutions a picker value stands for: rounded to a whole
 * number and clamped to the picker's range, with anything that is not a
 * finite number (an unset `wa-select` reports null, a user picks a string)
 * falling back to the default.
 */
export function clampResolutions(value: unknown): number {
  const number = typeof value === 'string' ? Number.parseFloat(value) : value
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    return DEFAULT_NUMBER_OF_RESOLUTIONS
  }
  return Math.min(MAX_NUMBER_OF_RESOLUTIONS, Math.max(MIN_NUMBER_OF_RESOLUTIONS, Math.round(number)))
}

/** Pixel budgets the budget picker offers, in mebibytes, ascending. */
export const BUDGET_OPTIONS_MIB: readonly number[] = [10, 25, 50, 100]

const MIB = 1024 * 1024

/** Bytes of a budget given in mebibytes. */
export function budgetBytesOf(mebibytes: number): number {
  return Math.max(1, Math.round(mebibytes * MIB))
}

/** One entry of the budget picker: the byte count as the option's value, and its label. */
export interface BudgetEntry {
  /** The budget in bytes, as the `wa-option` value (a decimal string). */
  value: string
  /** The budget in bytes. */
  bytes: number
  /** "50 MB", or "4.0 MB" for a budget that is not a whole number of mebibytes. */
  label: string
}

/** The budget picker's label for a byte count: whole mebibytes without a fraction, others as `formatBytes` shows them. */
export function budgetLabel(bytes: number): string {
  return bytes % MIB === 0 ? `${bytes / MIB} MB` : formatBytes(bytes)
}

/**
 * The entries of the budget picker: the presets, plus `currentBytes` when
 * it is none of them (a `?budget=` query on the page URL can set any
 * value, and the picker must still show the budget in effect), ascending
 * by size.
 */
export function budgetEntries(currentBytes: number = PIXEL_BUDGET_BYTES): BudgetEntry[] {
  const sizes = new Set(BUDGET_OPTIONS_MIB.map(budgetBytesOf))
  if (Number.isFinite(currentBytes) && currentBytes > 0) {
    sizes.add(Math.round(currentBytes))
  }
  return [...sizes]
    .sort((a, b) => a - b)
    .map((bytes) => ({ value: String(bytes), bytes, label: budgetLabel(bytes) }))
}

/**
 * The byte count a budget picker value stands for, or undefined for a value
 * that is not a positive whole number of bytes (the picker is filled from
 * {@link budgetEntries}, so anything else is a bug rather than user input).
 */
export function budgetBytesForValue(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return undefined
  }
  const bytes = Number.parseInt(value, 10)
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : undefined
}
