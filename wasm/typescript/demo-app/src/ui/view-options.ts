// The decisions behind the view controls (src/ui/view-controls.ts): the
// slice layouts a 3D pair can be shown in, when that picker applies, the
// layout, crosshair, and 3D-render gradient opacity a panel draws content
// of a given dimension with, and the colormap list each panel's picker
// offers. Pure functions over niivue's constants
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

/**
 * niivue's gradient opacity for the 3D render of a volume, in [0, 1]: each
 * ray-march sample's alpha is scaled by its gradient magnitude raised to
 * eight times this, so flat regions (a template's non-zero background, a
 * homogeneous interior) turn transparent and surfaces stay solid. 0.25
 * clears the haze around the MNI templates without thinning the brain.
 */
export const VOLUME_GRADIENT_OPACITY = 0.25

/**
 * Gradient opacity a panel renders content of `dimension` with: none for a
 * 2D image, which is never ray-marched (turning it on would only have
 * niivue build a gradient texture nothing reads), {@link VOLUME_GRADIENT_OPACITY}
 * for a 3D one.
 */
export function gradientOpacityForDimension(dimension: 2 | 3): number {
  return dimension === 2 ? 0 : VOLUME_GRADIENT_OPACITY
}

/** The slice layout picker applies: the loaded pair is 3D (the pair check keeps both dimensions equal). */
export function showsSliceTypePicker(state: Readonly<Pick<AppState, 'fixed'>>): boolean {
  return state.fixed?.dimension === 3
}

/** Colormap every panel starts with; niivue's own default, in its canonical casing. */
export const DEFAULT_COLORMAP = 'Gray'

/**
 * The colormaps a picker offers, in the order it lists them: grayscale,
 * heat, perceptually uniform, rainbow, and diverging. Names use niivue's
 * canonical casing (first letter uppercased).
 */
export const COLORMAP_CHOICES = [
  DEFAULT_COLORMAP,
  'Bone',
  'Hot',
  'Viridis',
  'Plasma',
  'Inferno',
  'Cividis',
  'Turbo',
  'Jet',
  'Blue2red',
] as const

/**
 * The names a colormap picker lists: the `COLORMAP_CHOICES` that niivue
 * registers (its `colormaps` getter, compared case-insensitively, niivue's
 * first spelling kept), in `COLORMAP_CHOICES` order, with the default
 * guaranteed present.
 */
export function colormapOptions(names: readonly string[]): string[] {
  const available = new Map<string, string>()
  for (const name of [DEFAULT_COLORMAP, ...names]) {
    const key = name.toLowerCase()
    if (!available.has(key)) {
      available.set(key, name)
    }
  }
  return COLORMAP_CHOICES.flatMap((choice) => available.get(choice.toLowerCase()) ?? [])
}
