import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  DARK_SCHEME_QUERY,
  DARK_THEME_CLASS,
  THEME_STORAGE_KEY,
  isColorScheme,
  metaColorScheme,
  oppositeScheme,
  resolveScheme,
  storedChoice,
  systemScheme,
  toggleLabel,
} from './theme-options.ts'

describe('resolveScheme', () => {
  it('follows the system while nothing is pinned', () => {
    assert.equal(resolveScheme(null, true), 'dark')
    assert.equal(resolveScheme(null, false), 'light')
    assert.equal(resolveScheme(undefined, true), 'dark')
  })

  it('takes a pinned scheme over the system', () => {
    assert.equal(resolveScheme('light', true), 'light')
    assert.equal(resolveScheme('dark', false), 'dark')
  })

  it('ignores anything but the two schemes', () => {
    assert.equal(resolveScheme('auto', true), 'dark')
    assert.equal(resolveScheme('', false), 'light')
    assert.equal(resolveScheme(42, true), 'dark')
    assert.equal(isColorScheme('dark'), true)
    assert.equal(isColorScheme('Dark'), false)
  })
})

describe('storedChoice', () => {
  it('pins a scheme that differs from the system', () => {
    assert.equal(storedChoice('dark', false), 'dark')
    assert.equal(storedChoice('light', true), 'light')
  })

  it('unpins a scheme that matches the system', () => {
    assert.equal(storedChoice('dark', true), null)
    assert.equal(storedChoice('light', false), null)
  })

  it('round-trips through resolveScheme', () => {
    for (const prefersDark of [true, false]) {
      for (const scheme of ['light', 'dark'] as const) {
        assert.equal(resolveScheme(storedChoice(scheme, prefersDark), prefersDark), scheme)
      }
    }
  })
})

describe('scheme helpers', () => {
  it('names the opposite scheme and the system scheme', () => {
    assert.equal(oppositeScheme('dark'), 'light')
    assert.equal(oppositeScheme('light'), 'dark')
    assert.equal(systemScheme(true), 'dark')
    assert.equal(systemScheme(false), 'light')
  })

  it('declares both schemes to the browser while following the system', () => {
    assert.equal(metaColorScheme(null), 'light dark')
    assert.equal(metaColorScheme('dark'), 'dark')
    assert.equal(metaColorScheme('light'), 'light')
  })

  it('labels the toggle with the action it performs', () => {
    assert.equal(toggleLabel('light'), 'Switch to the dark theme')
    assert.equal(toggleLabel('dark'), 'Switch to the light theme')
  })
})

describe('the inline script in index.html', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

  it('declares both schemes before anything is styled', () => {
    assert.match(html, /<meta name="color-scheme" content="light dark" \/>/)
  })

  it('uses the same storage key, class, and media query as the toggle', () => {
    const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    assert.ok(inline, 'index.html should carry a classic inline script for the first paint')
    assert.ok(inline.includes(`'${THEME_STORAGE_KEY}'`), 'storage key')
    assert.ok(inline.includes(`'${DARK_THEME_CLASS}'`), 'dark class')
    assert.ok(inline.includes(`'${DARK_SCHEME_QUERY}'`), 'media query')
  })
})
