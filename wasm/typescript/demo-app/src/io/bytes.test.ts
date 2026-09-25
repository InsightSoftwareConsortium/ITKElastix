// Unit tests for the byte helpers. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { toPlainUint8Array } from './bytes.ts'

test('copies a Uint8Array into a fresh buffer that later writes do not affect', () => {
  const source = new Uint8Array([1, 2, 3])
  const copy = toPlainUint8Array(source)
  assert.deepEqual(Array.from(copy), [1, 2, 3])
  assert.notEqual(copy.buffer, source.buffer)
  source[0] = 9
  assert.equal(copy[0], 1)
})

test('copies only the viewed window of a larger backing buffer', () => {
  const backing = new Uint8Array([0, 1, 2, 3, 4, 5])
  const window = new Uint8Array(backing.buffer, 2, 3)
  const copy = toPlainUint8Array(window)
  assert.deepEqual(Array.from(copy), [2, 3, 4])
  assert.equal(copy.byteOffset, 0)
  assert.equal(copy.buffer.byteLength, 3)
})

test('reinterprets other typed arrays byte for byte', () => {
  const source = new Int16Array([-1, 258])
  const copy = toPlainUint8Array(source)
  assert.equal(copy.byteLength, 4)
  assert.deepEqual(Array.from(copy), Array.from(new Uint8Array(source.buffer)))
})

test('moves SharedArrayBuffer-backed views onto a plain ArrayBuffer', () => {
  const shared = new SharedArrayBuffer(4)
  const view = new Uint8Array(shared)
  view.set([7, 8, 9, 10])
  const copy = toPlainUint8Array(view)
  assert.ok(copy.buffer instanceof ArrayBuffer)
  assert.ok(!(copy.buffer instanceof SharedArrayBuffer))
  assert.deepEqual(Array.from(copy), [7, 8, 9, 10])
})

test('accepts a raw ArrayBuffer', () => {
  const buffer = new Uint8Array([4, 5]).buffer
  const copy = toPlainUint8Array(buffer)
  assert.deepEqual(Array.from(copy), [4, 5])
  assert.notEqual(copy.buffer, buffer)
})
