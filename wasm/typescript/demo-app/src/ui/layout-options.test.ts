import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { NARROW_LAYOUT_MAX_WIDTH_PX, NARROW_LAYOUT_QUERY, canvasIsStale, drawingBufferSize, orientationFor } from './layout-options.ts'

describe('orientationFor', () => {
  it('stacks the viewers on a narrow viewport only', () => {
    assert.equal(orientationFor(true), 'vertical')
    assert.equal(orientationFor(false), 'horizontal')
  })
})

describe('NARROW_LAYOUT_QUERY', () => {
  it('is the breakpoint in range syntax', () => {
    assert.equal(NARROW_LAYOUT_QUERY, '(width < 800px)')
    assert.equal(NARROW_LAYOUT_MAX_WIDTH_PX, 800)
  })

  it('is the breakpoint style.css uses', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8')
    const queries = css.match(/@media \([^)]*\)/g) ?? []
    assert.ok(queries.length > 0, 'style.css should have narrow-viewport rules')
    for (const query of queries) {
      assert.equal(query, `@media ${NARROW_LAYOUT_QUERY}`)
    }
  })
})

describe('drawingBufferSize', () => {
  it('scales the CSS box to device pixels, rounding down', () => {
    assert.deepEqual(drawingBufferSize({ width: 300.7, height: 200.2 }, 1), { width: 300, height: 200 })
    assert.deepEqual(drawingBufferSize({ width: 300.7, height: 200.2 }, 2), { width: 601, height: 400 })
    assert.deepEqual(drawingBufferSize({ width: 100, height: 100 }, 1.5), { width: 150, height: 150 })
  })

  it('never yields an empty buffer and treats a bad ratio as 1', () => {
    assert.deepEqual(drawingBufferSize({ width: 0, height: 0 }, 2), { width: 1, height: 1 })
    assert.deepEqual(drawingBufferSize({ width: 50, height: 40 }, 0), { width: 50, height: 40 })
    assert.deepEqual(drawingBufferSize({ width: 50, height: 40 }, Number.NaN), { width: 50, height: 40 })
  })
})

describe('canvasIsStale', () => {
  it('is false while the buffer matches the box', () => {
    assert.equal(canvasIsStale({ width: 600, height: 400 }, { width: 600, height: 400 }, 1), false)
    assert.equal(canvasIsStale({ width: 1200, height: 800 }, { width: 600, height: 400 }, 2), false)
    assert.equal(canvasIsStale({ width: 1, height: 1 }, { width: 0, height: 0 }, 1), false)
  })

  it('is true once the box has changed on either axis or the ratio has', () => {
    assert.equal(canvasIsStale({ width: 600, height: 400 }, { width: 700, height: 400 }, 1), true)
    assert.equal(canvasIsStale({ width: 600, height: 400 }, { width: 600, height: 300 }, 1), true)
    assert.equal(canvasIsStale({ width: 600, height: 400 }, { width: 600, height: 400 }, 2), true)
  })
})
