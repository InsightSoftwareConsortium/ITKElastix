// Notifications: a stack of `wa-callout` toasts at the top right of the
// page (markup in index.html) that every flow reports its outcome through.
// The shell forwards each status of a success, warning, or danger variant
// here (src/ui/shell.ts), so the register, reload, and download flows and
// the panels need no toast code of their own; the ingest warning for a
// very large input, a colormap that could not be applied, a display update
// that threw, and the two start-up failures (no WebGL2, the app failing to
// start) are raised directly. A toast dismisses itself after a time that
// depends on its variant, paused while the pointer or the focus is on it,
// or on its dismiss button; a persistent one (duration zero) stays until
// dismissed, and one that cannot be dismissed stays for good. The stack is
// a manual popover, which puts it in the top layer, and it is shown again
// on every toast so it paints above the splash dialog even when that was
// opened after it; a modal dialog keeps everything outside it inert,
// though, so a toast raised while the splash is open can be read but not
// clicked until the dialog closes (its clock still runs). The decisions are
// in src/ui/notify-options.ts.
import type WaButton from '@awesome.me/webawesome/dist/components/button/button.js'
import type WaCallout from '@awesome.me/webawesome/dist/components/callout/callout.js'

import { MAX_TOASTS, failureMessage, toastDuration, toastRole, toastsToEvict, type ToastVariant } from './notify-options'
import { createListenerBag, requireElement } from './shell'

export interface ToastOptions {
  /** Defaults to `neutral`. */
  variant?: ToastVariant
  /**
   * Milliseconds before the toast dismisses itself; `PERSISTENT_TOAST`
   * (zero) keeps it until it is dismissed. Defaults per variant.
   */
  duration?: number
  /**
   * Whether the toast carries a dismiss button. Default true; false only
   * for a message nothing can be done about, which then stays for good.
   */
  dismissible?: boolean
  /**
   * Whether assistive technology is told about the toast. Default true;
   * the shell passes false because its status row, a live region, has
   * already announced the same text.
   */
  announce?: boolean
  /** A toast shown earlier under the same key is replaced by this one. */
  key?: string
}

export interface Toast {
  readonly element: WaCallout
  readonly message: string
  readonly variant: ToastVariant
  /** Stays until dismissed. */
  readonly persistent: boolean
  readonly dismissible: boolean
  readonly key: string | undefined
  /** Remove the toast now. */
  dismiss(): void
}

export interface NotifierElements {
  /** `#toast-stack`, the popover the toasts are stacked in. */
  stack: HTMLElement
}

export interface Notifier {
  readonly elements: NotifierElements
  /** The toasts on show, oldest first. */
  readonly toasts: readonly Toast[]
  show(message: string, options?: ToastOptions): Toast
  success(message: string, options?: Omit<ToastOptions, 'variant'>): Toast
  warning(message: string, options?: Omit<ToastOptions, 'variant'>): Toast
  danger(message: string, options?: Omit<ToastOptions, 'variant'>): Toast
  /**
   * A danger toast reading "<context>: <message of error>"; the error is
   * also logged to the console with its stack.
   */
  failure(context: string, error: unknown, options?: Omit<ToastOptions, 'variant'>): Toast
  /**
   * Await `task`, reporting a rejection through {@link failure} under
   * `context`. Never rejects itself, so an event handler can hand it a
   * flow's promise and forget it.
   */
  guard(context: string, task: Promise<unknown>): Promise<void>
  /** Remove every toast at once, the persistent ones included. */
  dismissAll(): void
  destroy(): void
}

/** Stroked 24-unit line icons, drawn like the theme toggle's. */
const ICON_PATHS: Readonly<Record<ToastVariant, string>> = {
  success: '<circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" />',
  warning: '<path d="M12 3.5 2.5 20h19L12 3.5z" /><path d="M12 10v4M12 17.5h.01" />',
  danger: '<circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" />',
  brand: '<circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />',
  neutral: '<circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />',
}
const DISMISS_ICON_PATHS = '<path d="m6 6 12 12M18 6 6 18" />'
const SVG_NS = 'http://www.w3.org/2000/svg'

function lineIcon(paths: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'toast-icon')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  // Static markup from this module, never user content.
  svg.innerHTML = paths
  return svg
}

/** How long a toast takes to fade in or out, in milliseconds. */
const TRANSITION_MS = 150
const HIDDEN: Keyframe = { opacity: 0, translate: '0 -0.5rem' }
const SHOWN: Keyframe = { opacity: 1, translate: '0 0' }

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Animate `element` from one keyframe to the other, or not at all where
 * motion is unwanted or unsupported. Resolves when done; a cancelled
 * animation (the element removed early) resolves too.
 */
function transition(element: HTMLElement, from: Keyframe, to: Keyframe): Promise<void> {
  if (prefersReducedMotion() || typeof element.animate !== 'function') {
    return Promise.resolve()
  }
  const animation = element.animate([from, to], { duration: TRANSITION_MS, easing: 'ease-out', fill: 'forwards' })
  return animation.finished.then(
    () => undefined,
    () => undefined,
  )
}

/**
 * Bind the toast stack under `root` and return the notifier the app
 * reports through, until `destroy()` is called.
 */
export function createNotifier(root: ParentNode): Notifier {
  const stack = requireElement<HTMLElement>(root, '#toast-stack')
  const canPopover = typeof stack.showPopover === 'function'
  const toasts: Toast[] = []
  /** Stops the timer and drops the listeners of one toast. */
  const cleanups = new Map<Toast, () => void>()

  function showStack(): void {
    // The data attribute shows the stack where popovers are unsupported.
    stack.dataset.open = ''
    if (!canPopover) {
      return
    }
    // Showing the popover again moves it to the end of the top layer, so
    // the stack is above a dialog opened since it was first shown.
    if (stack.matches(':popover-open')) {
      stack.hidePopover()
    }
    stack.showPopover()
  }

  function hideStack(): void {
    delete stack.dataset.open
    if (canPopover && stack.matches(':popover-open')) {
      stack.hidePopover()
    }
  }

  function remove(toast: Toast, animate: boolean): void {
    const index = toasts.indexOf(toast)
    if (index === -1) {
      return
    }
    toasts.splice(index, 1)
    cleanups.get(toast)?.()
    cleanups.delete(toast)
    const done = () => {
      toast.element.remove()
      if (toasts.length === 0) {
        hideStack()
      }
    }
    if (animate) {
      void transition(toast.element, SHOWN, HIDDEN).then(done)
    } else {
      done()
    }
  }

  function show(message: string, options: ToastOptions = {}): Toast {
    const { variant = 'neutral', dismissible = true, announce = true, key } = options
    const duration = toastDuration(variant, options.duration)
    const persistent = duration === 0

    if (key !== undefined) {
      const earlier = toasts.find((toast) => toast.key === key)
      if (earlier) {
        remove(earlier, false)
      }
    }
    for (const old of toastsToEvict(toasts, MAX_TOASTS - 1)) {
      remove(old, false)
    }

    const element = document.createElement('wa-callout')
    // The `wa-<variant>` utility class maps the variant's colour tokens
    // onto the host, where the stylesheet draws the accent and the icon.
    element.className = `toast wa-${variant}`
    element.variant = variant
    element.appearance = 'outlined'
    element.size = 's'
    element.dataset.variant = variant
    if (persistent) {
      element.dataset.persistent = ''
    }
    if (announce) {
      element.setAttribute('role', toastRole(variant))
    }

    const icon = lineIcon(ICON_PATHS[variant])
    icon.setAttribute('slot', 'icon')
    const body = document.createElement('div')
    body.className = 'toast-body'
    const text = document.createElement('span')
    text.className = 'toast-message'
    text.textContent = message
    body.append(text)
    element.append(icon, body)

    // The clock runs only while neither the pointer nor the focus is on
    // the toast, so it can be read or its button reached in peace.
    const bag = createListenerBag()
    let timer: ReturnType<typeof setTimeout> | null = null
    let remaining = duration
    let startedAt = 0
    let hovered = false
    let focused = false
    const start = () => {
      if (persistent || timer !== null) {
        return
      }
      startedAt = performance.now()
      timer = setTimeout(() => remove(toast, true), remaining)
    }
    const pause = () => {
      if (timer === null) {
        return
      }
      clearTimeout(timer)
      timer = null
      remaining = Math.max(0, remaining - (performance.now() - startedAt))
    }
    const settle = () => {
      if (hovered || focused) {
        pause()
      } else {
        start()
      }
    }
    bag.listen(element, 'pointerenter', () => {
      hovered = true
      settle()
    })
    bag.listen(element, 'pointerleave', () => {
      hovered = false
      settle()
    })
    bag.listen(element, 'focusin', () => {
      focused = true
      settle()
    })
    bag.listen(element, 'focusout', () => {
      focused = false
      settle()
    })

    if (dismissible) {
      const button: WaButton = document.createElement('wa-button')
      button.className = 'toast-dismiss'
      button.appearance = 'plain'
      button.size = 's'
      // Named like the theme toggle: an icon plus a visually hidden label.
      const label = document.createElement('span')
      label.className = 'wa-visually-hidden'
      label.textContent = 'Dismiss'
      button.append(lineIcon(DISMISS_ICON_PATHS), label)
      bag.listen(button, 'click', () => remove(toast, true))
      body.append(button)
    }

    const toast: Toast = {
      element,
      message,
      variant,
      persistent,
      dismissible,
      key,
      dismiss: () => remove(toast, true),
    }
    cleanups.set(toast, () => {
      pause()
      bag.removeAll()
    })
    toasts.push(toast)
    stack.append(element)
    showStack()
    void transition(element, HIDDEN, SHOWN)
    start()
    return toast
  }

  function failure(context: string, error: unknown, options: Omit<ToastOptions, 'variant'> = {}): Toast {
    console.error(context, error)
    return show(failureMessage(context, error), { ...options, variant: 'danger' })
  }

  function dismissAll(): void {
    for (const toast of [...toasts]) {
      remove(toast, false)
    }
  }

  return {
    elements: { stack },
    get toasts() {
      return toasts
    },
    show,
    success: (message, options = {}) => show(message, { ...options, variant: 'success' }),
    warning: (message, options = {}) => show(message, { ...options, variant: 'warning' }),
    danger: (message, options = {}) => show(message, { ...options, variant: 'danger' }),
    failure,
    guard(context, task) {
      return task.then(
        () => undefined,
        (error: unknown) => {
          failure(context, error)
        },
      )
    },
    dismissAll,
    destroy() {
      dismissAll()
    },
  }
}
