// Decisions behind the notification toasts (src/ui/notify.ts), free of the
// DOM so node:test runs them: the variants a toast can take, how long each
// stays, how many are shown at once and which give way, the role
// assistive technology is told, the shape of a failure message, and the
// wording of the messages the app raises outside any flow.

/** The `wa-callout` variants a toast can take. */
export type ToastVariant = 'success' | 'warning' | 'danger' | 'brand' | 'neutral'

export const TOAST_VARIANTS: readonly ToastVariant[] = ['success', 'warning', 'danger', 'brand', 'neutral']

export function isToastVariant(value: unknown): value is ToastVariant {
  return (TOAST_VARIANTS as readonly unknown[]).includes(value)
}

/** A toast duration of zero keeps the toast until it is dismissed. */
export const PERSISTENT_TOAST = 0

/**
 * How long a toast of each variant stays, in milliseconds: long enough to
 * read, and longer for what the user may have to act on. The clock stops
 * while the pointer or the focus is on the toast.
 */
export const TOAST_DURATIONS_MS: Readonly<Record<ToastVariant, number>> = {
  neutral: 6_000,
  brand: 6_000,
  success: 6_000,
  warning: 10_000,
  danger: 12_000,
}

/**
 * The time a toast stays: `duration` when it is a finite, non-negative
 * number (zero, {@link PERSISTENT_TOAST}, means until dismissed), else
 * the variant's default.
 */
export function toastDuration(variant: ToastVariant, duration?: number): number {
  if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0) {
    return duration
  }
  return TOAST_DURATIONS_MS[variant]
}

/** Toasts shown at once; beyond it the oldest ones that can go give way. */
export const MAX_TOASTS = 5

/**
 * The toasts to drop so that at most `max` remain, oldest first. A
 * persistent toast (no WebGL2, the app failed to start) never gives way,
 * so the list may be shorter than the excess.
 */
export function toastsToEvict<T extends { persistent: boolean }>(toasts: readonly T[], max = MAX_TOASTS): T[] {
  const excess = toasts.length - max
  if (excess <= 0) {
    return []
  }
  return toasts.filter((toast) => !toast.persistent).slice(0, excess)
}

/**
 * The ARIA role of a toast: an alert for a danger toast, which is read
 * out at once, and a status otherwise.
 */
export function toastRole(variant: ToastVariant): 'alert' | 'status' {
  return variant === 'danger' ? 'alert' : 'status'
}

/** The message of whatever was thrown or rejected with. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** "<context>: <message of error>", the text of a failure toast. */
export function failureMessage(context: string, error: unknown): string {
  return `${context}: ${errorMessage(error)}`
}

/** Shown, and kept, when the browser cannot create a WebGL2 context. */
export const WEBGL2_UNAVAILABLE_MESSAGE =
  'This browser could not create a WebGL2 context, which the viewers need. ' +
  'Enable hardware acceleration or WebGL in the browser settings, or open the demo in another browser; ' +
  'images cannot be displayed or registered without it.'

/** The status line while the app is unusable for want of WebGL2. */
export const WEBGL2_UNAVAILABLE_STATUS = 'WebGL2 is unavailable, so the demo cannot start.'

/** The status line when start-up failed for any other reason; the toast carries the cause. */
export const STARTUP_FAILED_STATUS = 'The demo failed to start.'
