// The decisions behind the two comparison viewers (markup in index.html,
// wiring in src/ui/shell.ts): which comparisons there are, the two sides
// each holds, how a panel (one side of one comparison) is identified and
// labelled, which `wa-comparison` slot a side takes, what each panel
// displays for a state, and the caption drawn over it. Pure functions over
// the state, free of DOM access, so the node unit tests can cover them;
// src/viewer/panel.ts and the ui modules import the roles from here.
import {
  fixedPanelContent,
  isShowingResult,
  movingPanelContent,
  resultPanelContent,
  type AppState,
  type PanelContent,
} from '../state.ts'

/**
 * The two comparisons, in layout order: the inputs (the fixed image
 * against the moving image) on the left, and the result (the fixed image
 * against the registered result once a run has finished and while the
 * result switch is on, the moving image otherwise) on the right.
 */
export type ComparisonRole = 'inputs' | 'result'
export const COMPARISON_ROLES: readonly ComparisonRole[] = ['inputs', 'result']

/**
 * The two sides of a comparison: the fixed image, drawn on the left of the
 * divider, and the moving image (or the registered result, which is the
 * moving image resampled onto the fixed grid) on the right.
 */
export type ComparisonSide = 'fixed' | 'moving'
export const COMPARISON_SIDES: readonly ComparisonSide[] = ['fixed', 'moving']

/** One niivue panel: a side of a comparison, `<comparison>-<side>`. */
export type DemoPanelRole = `${ComparisonRole}-${ComparisonSide}`

/** Every panel, comparison by comparison, the fixed side first. */
export const PANEL_ROLES: readonly DemoPanelRole[] = COMPARISON_ROLES.flatMap((comparison) =>
  COMPARISON_SIDES.map((side) => panelRole(comparison, side)),
)

/** The role of the `side` panel of `comparison`. */
export function panelRole(comparison: ComparisonRole, side: ComparisonSide): DemoPanelRole {
  return `${comparison}-${side}`
}

/** The comparison a panel belongs to. */
export function panelComparison(role: DemoPanelRole): ComparisonRole {
  return role.startsWith('inputs-') ? 'inputs' : 'result'
}

/** The side of its comparison a panel is. */
export function panelSide(role: DemoPanelRole): ComparisonSide {
  return role.endsWith('-fixed') ? 'fixed' : 'moving'
}

/** The `side` panel of every comparison, in layout order. */
export function panelsOnSide(side: ComparisonSide): DemoPanelRole[] {
  return COMPARISON_ROLES.map((comparison) => panelRole(comparison, side))
}

/**
 * The `wa-comparison` slot each side is placed in. The component clips its
 * `after` slot with an inset that grows from the right as the divider moves
 * left, so the `after` content is what shows on the left of the divider;
 * the fixed side takes that slot to sit on the left, and the moving side
 * shows through on the right.
 */
export const SIDE_SLOTS: Readonly<Record<ComparisonSide, 'before' | 'after'>> = { fixed: 'after', moving: 'before' }

/** Where the divider of a fresh comparison sits, as a percentage of its width; "Reset view" returns it there. */
export const DEFAULT_COMPARISON_POSITION = 50

/** A short name for a panel, for status messages and the canvas's accessible label. */
export function panelLabel(role: DemoPanelRole): string {
  const side = panelSide(role) === 'fixed' ? 'Fixed' : 'Moving'
  return `${side} (${panelComparison(role)})`
}

/**
 * What a panel displays for `state`: the fixed input on either fixed side;
 * the moving input on the inputs comparison's moving side; and on the
 * result comparison's moving side the registered result while it is
 * selected for display, the moving input otherwise. Undefined while empty.
 */
export function panelContent(state: Readonly<AppState>, role: DemoPanelRole): PanelContent | undefined {
  if (panelSide(role) === 'fixed') {
    return fixedPanelContent(state)
  }
  return panelComparison(role) === 'result' ? resultPanelContent(state) : movingPanelContent(state)
}

/** The badge over a panel: its text and the `wa-badge` variant it is drawn in. */
export interface PanelCaption {
  text: string
  variant: 'neutral' | 'brand' | 'success'
}

/**
 * The caption over a panel for `state`: "Fixed · <name>" in neutral, "Moving ·
 * <name>" in the brand colour, and on the result comparison while the
 * registered result is shown, "Registered · on the fixed grid" in the
 * success colour. Without an image the side's bare name.
 */
export function panelCaption(state: Readonly<AppState>, role: DemoPanelRole): PanelCaption {
  if (panelSide(role) === 'fixed') {
    return { text: state.fixed ? `Fixed · ${state.fixed.name}` : 'Fixed', variant: 'neutral' }
  }
  if (panelComparison(role) === 'result' && isShowingResult(state)) {
    return { text: 'Registered · on the fixed grid', variant: 'success' }
  }
  return { text: state.moving ? `Moving · ${state.moving.name}` : 'Moving', variant: 'brand' }
}
