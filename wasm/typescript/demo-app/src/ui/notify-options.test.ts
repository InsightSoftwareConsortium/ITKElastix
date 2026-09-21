// Unit tests for the toast decisions and the markup they rely on. Run with
// `pnpm test:unit`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  MAX_TOASTS,
  PERSISTENT_TOAST,
  TOAST_DURATIONS_MS,
  TOAST_VARIANTS,
  WEBGL2_UNAVAILABLE_MESSAGE,
  errorMessage,
  failureMessage,
  isToastVariant,
  toastDuration,
  toastRole,
  toastsToEvict,
} from './notify-options.ts'

describe('toastDuration', () => {
  it('gives every variant a default, the ones that may need acting on longer', () => {
    for (const variant of TOAST_VARIANTS) {
      assert.equal(toastDuration(variant), TOAST_DURATIONS_MS[variant])
      assert.ok(TOAST_DURATIONS_MS[variant] > 0, `${variant} toasts dismiss themselves`)
    }
    assert.ok(TOAST_DURATIONS_MS.warning > TOAST_DURATIONS_MS.success)
    assert.ok(TOAST_DURATIONS_MS.danger > TOAST_DURATIONS_MS.warning)
  })

  it('takes a finite, non-negative override, zero meaning persistent', () => {
    assert.equal(toastDuration('success', 2_500), 2_500)
    assert.equal(toastDuration('danger', PERSISTENT_TOAST), 0)
    assert.equal(toastDuration('danger', -1), TOAST_DURATIONS_MS.danger)
    assert.equal(toastDuration('warning', Number.NaN), TOAST_DURATIONS_MS.warning)
    assert.equal(toastDuration('warning', Number.POSITIVE_INFINITY), TOAST_DURATIONS_MS.warning)
  })
})

describe('toastsToEvict', () => {
  const toast = (id: number, persistent = false) => ({ id, persistent })

  it('keeps everything within the limit', () => {
    assert.deepEqual(toastsToEvict([], MAX_TOASTS), [])
    assert.deepEqual(toastsToEvict([toast(1), toast(2)], 2), [])
  })

  it('drops the oldest dismissible toasts beyond the limit, never a persistent one', () => {
    const stack = [toast(1), toast(2, true), toast(3), toast(4), toast(5)]
    assert.deepEqual(toastsToEvict(stack, 4), [toast(1)])
    assert.deepEqual(toastsToEvict(stack, 3), [toast(1), toast(3)])
    assert.deepEqual(toastsToEvict([toast(1, true), toast(2, true)], 1), [])
  })

  it('defaults to MAX_TOASTS', () => {
    const stack = Array.from({ length: MAX_TOASTS + 2 }, (_, index) => toast(index))
    assert.deepEqual(toastsToEvict(stack), [toast(0), toast(1)])
  })
})

describe('toastRole', () => {
  it('makes a danger toast an alert and the rest a status', () => {
    assert.equal(toastRole('danger'), 'alert')
    for (const variant of TOAST_VARIANTS.filter((name) => name !== 'danger')) {
      assert.equal(toastRole(variant), 'status')
    }
  })
})

describe('isToastVariant', () => {
  it('accepts the callout variants only', () => {
    for (const variant of TOAST_VARIANTS) {
      assert.equal(isToastVariant(variant), true)
    }
    assert.equal(isToastVariant('info'), false)
    assert.equal(isToastVariant(undefined), false)
  })
})

describe('errorMessage and failureMessage', () => {
  it('take the message of an Error and the text of anything else', () => {
    assert.equal(errorMessage(new Error('boom')), 'boom')
    assert.equal(errorMessage(1799504), '1799504')
    assert.equal(errorMessage('plain'), 'plain')
    assert.equal(failureMessage('Could not write registered.png', new Error('code 7')), 'Could not write registered.png: code 7')
  })
})

describe('the toast stack markup', () => {
  it('is a manual popover, so it sits in the top layer above the splash dialog', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
    const stack = /<div[^>]*id="toast-stack"[^>]*>/.exec(html)?.[0]
    assert.ok(stack, 'index.html should hold #toast-stack')
    assert.match(stack, /popover="manual"/)
    assert.match(stack, /aria-label="Notifications"/)
    assert.doesNotMatch(html, /id="status-callout"/, 'the inline status callout has been replaced by the toasts')
  })

  it('has WebGL2 wording that names the problem and a way out', () => {
    assert.match(WEBGL2_UNAVAILABLE_MESSAGE, /WebGL2/)
    assert.match(WEBGL2_UNAVAILABLE_MESSAGE, /another browser/)
  })
})
