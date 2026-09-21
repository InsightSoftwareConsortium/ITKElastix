// Round-trip tests for the JavaScript .iwi.cbor encoder. Run with
// `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Image } from 'itk-wasm'
import { decode } from 'cbor-x'

import { imageToIwiCborBytes, imageToIwiDocument } from './iwi-cbor.ts'

const TAG_PREFIX = 0xd8
const SINT16_LITTLE_ENDIAN_TAG = 77
const SINT16_BIG_ENDIAN_TAG = 73
const FLOAT32_LITTLE_ENDIAN_TAG = 85

function int16Image(): Image {
  return {
    imageType: { dimension: 3, componentType: 'int16', pixelType: 'Scalar', components: 1 },
    name: 'ct',
    origin: [1.5, -2, 0],
    spacing: [0.5, 0.5, 1],
    direction: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    size: [3, 2, 1],
    metadata: new Map([['modality', 'CT']]),
    data: new Int16Array([4, 0, 10, 5, 3, 251]),
  }
}

/** Index of the CBOR tag that precedes the `data` byte string, if any. */
function tagAfterKey(bytes: Uint8Array, key: string): number | null {
  const needle = new TextEncoder().encode(key)
  outer: for (let i = 0; i + needle.length + 1 < bytes.length; i++) {
    // text(n) header byte for a short string is 0x60 + n
    if (bytes[i] !== 0x60 + needle.length) continue
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + 1 + j] !== needle[j]) continue outer
    }
    const after = i + 1 + needle.length
    return bytes[after] === TAG_PREFIX ? bytes[after + 1] : null
  }
  throw new Error(`key ${key} not found`)
}

test('int16 voxels decode back with identical values and type', () => {
  const bytes = imageToIwiCborBytes(int16Image())
  const iwi = decode(bytes) as ReturnType<typeof imageToIwiDocument>
  assert.ok(iwi.data instanceof Int16Array)
  assert.deepEqual(Array.from(iwi.data as Int16Array), [4, 0, 10, 5, 3, 251])
  assert.deepEqual(iwi.size, [3, 2, 1])
  assert.deepEqual(iwi.spacing, [0.5, 0.5, 1])
  assert.deepEqual(iwi.origin, [1.5, -2, 0])
  assert.deepEqual(Array.from(iwi.direction as Float64Array), [1, 0, 0, 0, 1, 0, 0, 0, 1])
  assert.deepEqual(iwi.imageType, { dimension: 3, componentType: 'int16', pixelType: 'Scalar', components: 1 })
  assert.equal(iwi.name, 'ct')
})

test('pixel data carries the little-endian typed-array tag, not the big-endian one itk-wasm writes', () => {
  const tag = tagAfterKey(imageToIwiCborBytes(int16Image()), 'data')
  assert.equal(tag, SINT16_LITTLE_ENDIAN_TAG)
  assert.notEqual(tag, SINT16_BIG_ENDIAN_TAG)
})

test('float32 voxels round-trip as Float32Array with the float32 little-endian tag', () => {
  const image: Image = {
    ...int16Image(),
    imageType: { dimension: 3, componentType: 'float32', pixelType: 'Scalar', components: 1 },
    data: new Float32Array([0.5, -1.25, 3, 4, 5, 6]),
  }
  const bytes = imageToIwiCborBytes(image)
  assert.equal(tagAfterKey(bytes, 'data'), FLOAT32_LITTLE_ENDIAN_TAG)
  const iwi = decode(bytes) as ReturnType<typeof imageToIwiDocument>
  assert.ok(iwi.data instanceof Float32Array)
  assert.deepEqual(Array.from(iwi.data as Float32Array), [0.5, -1.25, 3, 4, 5, 6])
})

test('a view into a larger buffer serializes only its own bytes', () => {
  const backing = new Int16Array([99, 4, 0, 10, 5, 3, 251, 99])
  const image: Image = { ...int16Image(), data: backing.subarray(1, 7) }
  const iwi = decode(imageToIwiCborBytes(image)) as ReturnType<typeof imageToIwiDocument>
  assert.deepEqual(Array.from(iwi.data as Int16Array), [4, 0, 10, 5, 3, 251])
})

test('output is a plain ArrayBuffer of exactly the encoded length', () => {
  const bytes = imageToIwiCborBytes(int16Image())
  assert.ok(bytes.buffer instanceof ArrayBuffer)
  assert.equal(bytes.byteOffset, 0)
  assert.equal(bytes.buffer.byteLength, bytes.byteLength)
})

test('refuses an image without pixel data', () => {
  assert.throws(() => imageToIwiDocument({ ...int16Image(), data: null }), /no pixel data/)
})
