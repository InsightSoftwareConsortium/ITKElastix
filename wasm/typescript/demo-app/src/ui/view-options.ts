// The decisions behind the view controls (src/ui/view-controls.ts): the
// slice layouts a 3D pair can be shown in, when that picker applies, the
// layout and crosshair a panel draws content of a given dimension with,
// and the colormap list each panel's picker offers. Pure functions over niivue's constants
// and the state, free of DOM access, so the node unit tests can cover them.
// niivue's entry module imports cleanly in Node, so `SLICE_TYPE` is taken
// from the package rather than copied.
import { SLICE_TYPE } from '@niivue/niivue'

import type { AppState } from '../state.ts'

/** Ids of the slice layout picker's `wa-option`s. */
export type SliceTypeId = 'axial' | 'coronal' | 'sagittal' | 'multiplanar' | 'render'

export interface SliceTypeOption {
  id: SliceTypeId
  label: string
  /** The niivue `SLICE_TYPE` value the option selects. */
  sliceType: number
}

/** The picker's entries, in display order. */
export const SLICE_TYPE_OPTIONS: readonly SliceTypeOption[] = [
  { id: 'axial', label: 'Axial', sliceType: SLICE_TYPE.AXIAL },
  { id: 'coronal', label: 'Coronal', sliceType: SLICE_TYPE.CORONAL },
  { id: 'sagittal', label: 'Sagittal', sliceType: SLICE_TYPE.SAGITTAL },
  { id: 'multiplanar', label: 'Multiplanar', sliceType: SLICE_TYPE.MULTIPLANAR },
  { id: 'render', label: '3D render', sliceType: SLICE_TYPE.RENDER },
]

/** Layout a 3D pair opens in. */
export const DEFAULT_SLICE_TYPE_ID: SliceTypeId = 'multiplanar'
export const DEFAULT_SLICE_TYPE: number = SLICE_TYPE.MULTIPLANAR

export function isSliceTypeId(value: unknown): value is SliceTypeId {
  return typeof value === 'string' && SLICE_TYPE_OPTIONS.some((option) => option.id === value)
}

/** The `SLICE_TYPE` value behind a picker id. */
export function sliceTypeForId(id: SliceTypeId): number {
  const option = SLICE_TYPE_OPTIONS.find((candidate) => candidate.id === id)
  if (!option) {
    throw new Error(`Unknown slice type: ${id}`)
  }
  return option.sliceType
}

/** The picker id for a `SLICE_TYPE` value, or undefined for one the picker does not offer. */
export function sliceTypeIdFor(sliceType: number): SliceTypeId | undefined {
  return SLICE_TYPE_OPTIONS.find((option) => option.sliceType === sliceType)?.id
}

/**
 * Layout a panel draws content of `dimension` in: a 2D image (promoted to a
 * single slice for display) is always shown axially, since the other planes
 * and the render have nothing to show; a 3D image honours the chosen layout.
 */
export function sliceTypeForDimension(dimension: 2 | 3, chosen: number): number {
  return dimension === 2 ? SLICE_TYPE.AXIAL : chosen
}

/** Crosshair thickness, in canvas pixels, a panel draws over a 3D image. */
export const CROSSHAIR_WIDTH = 1

/**
 * Crosshair thickness a panel draws content of `dimension` with: none over
 * a 2D image, where the lines would only cover the picture (there are no
 * other planes for them to locate), {@link CROSSHAIR_WIDTH} over a 3D one.
 */
export function crosshairWidthForDimension(dimension: 2 | 3): number {
  return dimension === 2 ? 0 : CROSSHAIR_WIDTH
}

/** The slice layout picker applies: the loaded pair is 3D (the pair check keeps both dimensions equal). */
export function showsSliceTypePicker(state: Readonly<Pick<AppState, 'fixed'>>): boolean {
  return state.fixed?.dimension === 3
}

/** Colormap every panel starts with; niivue's own default, in its canonical casing. */
export const DEFAULT_COLORMAP = 'Gray'

/**
 * The names a colormap picker lists: niivue's built-in colormaps (the
 * `colormaps` getter), with the default guaranteed present, duplicates
 * (compared case-insensitively, the first kept) and niivue's internal
 * `_`-prefixed tables dropped, sorted case-insensitively.
 */
export function colormapOptions(names: readonly string[]): string[] {
  const seen = new Set<string>()
  const options: string[] = []
  for (const name of [DEFAULT_COLORMAP, ...names]) {
    const key = name.toLowerCase()
    if (name === '' || name.startsWith('_') || seen.has(key)) {
      continue
    }
    seen.add(key)
    options.push(name)
  }
  return options.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
}
