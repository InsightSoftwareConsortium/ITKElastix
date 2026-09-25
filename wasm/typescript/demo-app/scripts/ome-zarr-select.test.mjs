// Unit tests for the reduced-copy planner, on metadata shaped like the two
// time-lapse sources the samples come from. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  axisNames,
  chunkCopies,
  chunkKey,
  multiscalesOf,
  reduceArrayMetadata,
  reduceTransforms,
  reducedStoreMetadata,
  shardEntry,
  shardIndexLayout,
  splitAxes,
} from './ome-zarr-select.mjs'

const AXES_5D = [
  { name: 't', type: 'time', unit: 'minute' },
  { name: 'c', type: 'channel' },
  { name: 'z', type: 'space', unit: 'micrometer' },
  { name: 'y', type: 'space', unit: 'micrometer' },
  { name: 'x', type: 'space', unit: 'micrometer' },
]

/** OME-Zarr 0.4 on Zarr v2, like the SSBD tooth germ: one chunk per plane. */
function v2Source() {
  return {
    zarrFormat: 2,
    attributes: {
      multiscales: [
        {
          version: '0.4',
          axes: AXES_5D,
          datasets: [
            { path: '0', coordinateTransformations: [{ type: 'scale', scale: [30, 1, 2.187, 0.554, 0.554] }] },
            { path: '1', coordinateTransformations: [{ type: 'scale', scale: [30, 1, 2.187, 1.108, 1.108] }] },
          ],
        },
      ],
      omero: { channels: [{ label: 'Channel 0' }, { label: 'Channel 1' }] },
    },
    arrays: {
      0: { zarr_format: 2, shape: [271, 2, 43, 855, 862], chunks: [1, 1, 1, 855, 862], dimension_separator: '/', dtype: '|u1' },
      1: { zarr_format: 2, shape: [271, 2, 43, 427, 431], chunks: [1, 1, 1, 427, 431], dimension_separator: '/', dtype: '|u1' },
    },
  }
}

/** OME-Zarr 0.5 on Zarr v3, like the IDR zebrafish: one shard per time point. */
function v3Source() {
  const array = (shape) => ({
    zarr_format: 3,
    node_type: 'array',
    shape,
    data_type: 'uint16',
    chunk_grid: { name: 'regular', configuration: { chunk_shape: [1, 1, 201, 333, 333] } },
    chunk_key_encoding: { name: 'default' },
    codecs: [
      {
        name: 'sharding_indexed',
        configuration: {
          chunk_shape: [1, 1, 1, 333, 333],
          codecs: [{ name: 'bytes', configuration: { endian: 'little' } }, { name: 'blosc', configuration: { cname: 'zstd' } }],
          index_codecs: [{ name: 'bytes', configuration: { endian: 'little' } }, { name: 'crc32c' }],
        },
      },
    ],
    dimension_names: ['t', 'c', 'z', 'y', 'x'],
    attributes: { _ome2024_ngff_challenge_stats: { threads: 16 } },
  })
  return {
    zarrFormat: 3,
    attributes: {
      ome: {
        version: '0.5',
        multiscales: [
          {
            axes: AXES_5D.map(({ name, type }) => ({ name, type })),
            datasets: [
              { path: '0', coordinateTransformations: [{ type: 'scale', scale: [1, 1, 1, 1, 1] }] },
              { path: '1', coordinateTransformations: [{ type: 'scale', scale: [1, 1, 1, 2, 2] }] },
            ],
          },
        ],
      },
    },
    arrays: { 0: array([79, 1, 201, 333, 333]), 1: array([79, 1, 201, 166, 166]) },
  }
}

test('axis names come from objects or, in OME-Zarr 0.3, bare strings', () => {
  assert.deepEqual(axisNames(AXES_5D), ['t', 'c', 'z', 'y', 'x'])
  assert.deepEqual(axisNames(['t', 'y', 'x']), ['t', 'y', 'x'])
})

test('the selected axes are fixed and the rest kept, in order; an unknown axis is refused', () => {
  assert.deepEqual(splitAxes(['t', 'c', 'z', 'y', 'x'], { t: 20, c: 0 }), {
    kept: [2, 3, 4],
    fixed: [
      { index: 0, name: 't', value: 20 },
      { index: 1, name: 'c', value: 0 },
    ],
  })
  assert.throws(() => splitAxes(['z', 'y', 'x'], { t: 0 }), /Cannot select t=0: the image has axes z, y, x/)
})

test('scale and translation keep the entries of the kept axes only', () => {
  assert.deepEqual(
    reduceTransforms(
      [
        { type: 'scale', scale: [30, 1, 2.187, 0.554, 0.554] },
        { type: 'translation', translation: [0, 0, 5, 6, 7] },
      ],
      [3, 4],
    ),
    [
      { type: 'scale', scale: [0.554, 0.554] },
      { type: 'translation', translation: [6, 7] },
    ],
  )
  assert.deepEqual(reduceTransforms(undefined, [0]), [])
})

test('a v2 array loses the fixed axes from its shape and chunks and keeps its codec', () => {
  const { arrays } = v2Source()
  const reduced = reduceArrayMetadata(arrays[0], 2, [3, 4], [
    { index: 0, name: 't', value: 20 },
    { index: 1, name: 'c', value: 0 },
    { index: 2, name: 'z', value: 21 },
  ])
  assert.deepEqual(reduced, { ...arrays[0], shape: [855, 862], chunks: [855, 862] })
})

test('a sharded v3 array loses the fixed axes from its shards, inner chunks, and names, and its attributes', () => {
  const { arrays } = v3Source()
  const reduced = reduceArrayMetadata(arrays[1], 3, [2, 3, 4], [
    { index: 0, name: 't', value: 20 },
    { index: 1, name: 'c', value: 0 },
  ])
  assert.deepEqual(reduced.shape, [201, 166, 166])
  assert.deepEqual(reduced.chunk_grid.configuration.chunk_shape, [201, 333, 333])
  assert.deepEqual(reduced.codecs[0].configuration.chunk_shape, [1, 333, 333])
  assert.deepEqual(reduced.codecs[0].configuration.codecs, arrays[1].codecs[0].configuration.codecs)
  assert.deepEqual(reduced.codecs[0].configuration.index_codecs, arrays[1].codecs[0].configuration.index_codecs)
  assert.deepEqual(reduced.dimension_names, ['z', 'y', 'x'])
  assert.deepEqual(reduced.attributes, {})
})

test('an axis chunked deeper than one, an index out of range, or a transpose codec is refused', () => {
  const { arrays } = v3Source()
  const thickSlabs = v2Source().arrays[0]
  const fixedZ = [{ index: 2, name: 'z', value: 21 }]
  assert.throws(
    () => reduceArrayMetadata({ ...thickSlabs, chunks: [1, 1, 8, 855, 862] }, 2, [0, 1, 3, 4], fixedZ, '0'),
    /0: z is chunked 8 deep/,
  )
  // Sharded, the inner chunks must be one index deep too.
  const thickInner = structuredClone(arrays[0])
  thickInner.codecs[0].configuration.chunk_shape = [1, 1, 3, 333, 333]
  assert.throws(() => reduceArrayMetadata(thickInner, 3, [0, 1, 3, 4], [{ index: 2, name: 'z', value: 100 }], '0'), /0: z is chunked 201 deep/)
  assert.throws(
    () => reduceArrayMetadata(arrays[0], 3, [1, 2, 3, 4], [{ index: 0, name: 't', value: 79 }], '0'),
    /0: t=79 is outside 0\.\.78/,
  )
  const transposed = { ...arrays[0], codecs: [{ name: 'transpose', configuration: { order: [4, 3, 2, 1, 0] } }] }
  assert.throws(() => reduceArrayMetadata(transposed, 3, [1, 2, 3, 4], [{ index: 0, name: 't', value: 0 }], '0'), /transpose/)
})

test('chunk keys follow each format and encoding', () => {
  assert.equal(chunkKey({ dimension_separator: '/' }, 2, [0, 1, 2]), '0/1/2')
  assert.equal(chunkKey({}, 2, [0, 1, 2]), '0.1.2')
  assert.equal(chunkKey({ chunk_key_encoding: { name: 'default' } }, 3, [0, 1, 2]), 'c/0/1/2')
  assert.equal(chunkKey({ chunk_key_encoding: { name: 'default', configuration: { separator: '.' } } }, 3, [3, 4]), 'c.3.4')
  assert.equal(chunkKey({ chunk_key_encoding: { name: 'v2' } }, 3, [3, 4]), '3.4')
})

test('each reduced chunk is copied from the source chunk at the selected indices', () => {
  const { arrays } = v2Source()
  const fixed = [
    { index: 0, name: 't', value: 20 },
    { index: 1, name: 'c', value: 0 },
    { index: 2, name: 'z', value: 21 },
  ]
  const reduced = reduceArrayMetadata(arrays[0], 2, [3, 4], fixed)
  assert.deepEqual(chunkCopies(arrays[0], reduced, 2, fixed), [{ source: '20/0/21/0/0', target: '0/0' }])

  // A grid of several chunks along a kept axis enumerates every position.
  const tiled = { ...arrays[0], chunks: [1, 1, 1, 500, 862] }
  const tiledReduced = reduceArrayMetadata(tiled, 2, [3, 4], fixed)
  assert.deepEqual(chunkCopies(tiled, tiledReduced, 2, fixed), [
    { source: '20/0/21/0/0', target: '0/0' },
    { source: '20/0/21/1/0', target: '1/0' },
  ])
})

test('a v3 time point keeps its z-stack shard, renamed into the reduced grid', () => {
  const source = v3Source()
  const plan = reducedStoreMetadata({ ...source, selection: { t: 20, c: 0 }, source: 'https://example.org/zfish.zarr/0' })
  assert.deepEqual(
    plan.arrays.map(({ path, copies }) => [path, copies]),
    [
      ['0', [{ source: 'c/20/0/0/0/0', target: 'c/0/0/0' }]],
      ['1', [{ source: 'c/20/0/0/0/0', target: 'c/0/0/0' }]],
    ],
  )
  const files = Object.fromEntries(plan.files)
  assert.deepEqual(Object.keys(files), ['zarr.json', '0/zarr.json', '1/zarr.json'])
  const root = files['zarr.json']
  assert.equal(root.node_type, 'group')
  assert.equal(root.attributes.ome.version, '0.5')
  const [multiscale] = root.attributes.ome.multiscales
  assert.deepEqual(axisNames(multiscale.axes), ['z', 'y', 'x'])
  assert.deepEqual(multiscale.datasets[1].coordinateTransformations, [{ type: 'scale', scale: [1, 2, 2] }])
  assert.deepEqual(root.attributes.derivedFrom, { url: 'https://example.org/zfish.zarr/0', selection: { t: 20, c: 0 } })
})

test('a plane of a z-stack shard is copied unsharded, one inner chunk located through the shard index', () => {
  const source = v3Source()
  const plan = reducedStoreMetadata({ ...source, selection: { t: 20, c: 0, z: 100 }, source: 's' })
  const layout = { count: 201, byteLength: 201 * 16 + 4, location: 'end' }
  assert.deepEqual(
    plan.arrays.map(({ path, copies }) => [path, copies]),
    [
      ['0', [{ source: 'c/20/0/0/0/0', target: 'c/0/0', inner: { entry: 100, layout } }]],
      ['1', [{ source: 'c/20/0/0/0/0', target: 'c/0/0', inner: { entry: 100, layout } }]],
    ],
  )
  const reduced = Object.fromEntries(plan.files)['1/zarr.json']
  assert.deepEqual(reduced.shape, [166, 166])
  assert.deepEqual(reduced.chunk_grid.configuration.chunk_shape, [333, 333])
  // The copy's codecs are the source's inner ones: no sharding left.
  assert.deepEqual(reduced.codecs, source.arrays[1].codecs[0].configuration.codecs)
  assert.deepEqual(reduced.dimension_names, ['y', 'x'])
})

test('a shard index is count offset and length pairs, a checksum after them if the index codecs have one', () => {
  const sharding = { chunk_shape: [1, 1, 1, 333, 333], index_codecs: [{ name: 'bytes' }, { name: 'crc32c' }] }
  assert.deepEqual(shardIndexLayout(sharding, [1, 1, 201, 333, 333]), { count: 201, byteLength: 3220, location: 'end' })
  assert.deepEqual(shardIndexLayout({ ...sharding, index_codecs: [{ name: 'bytes' }], index_location: 'start' }, [1, 1, 4, 666, 333]), {
    count: 8,
    byteLength: 128,
    location: 'start',
  })

  const index = new DataView(new ArrayBuffer(3 * 16 + 4))
  index.setBigUint64(0, 0n, true)
  index.setBigUint64(8, 11816n, true)
  index.setBigUint64(16, 11816n, true)
  index.setBigUint64(24, 11861n, true)
  index.setBigUint64(32, 0xffffffffffffffffn, true)
  index.setBigUint64(40, 0xffffffffffffffffn, true)
  const bytes = new Uint8Array(index.buffer)
  assert.deepEqual(shardEntry(bytes, 0), { offset: 0, byteLength: 11816 })
  assert.deepEqual(shardEntry(bytes, 1), { offset: 11816, byteLength: 11861 })
  assert.equal(shardEntry(bytes, 2), null, 'an empty inner chunk is all ones')
  // A view into a larger buffer reads from its own start.
  assert.deepEqual(shardEntry(new Uint8Array(index.buffer, 16, 32), 0), { offset: 11816, byteLength: 11861 })
})

test('a v2 plane keeps the chosen levels, drops the channel metadata, and notes its source', () => {
  const source = v2Source()
  const plan = reducedStoreMetadata({
    ...source,
    selection: { t: 0, c: 0, z: 21 },
    levels: ['1'],
    source: 'https://example.org/tooth.zarr',
  })
  const files = Object.fromEntries(plan.files)
  assert.deepEqual(Object.keys(files), ['.zgroup', '.zattrs', '1/.zarray'])
  assert.deepEqual(files['.zgroup'], { zarr_format: 2 })
  const [multiscale] = files['.zattrs'].multiscales
  assert.equal(multiscale.version, '0.4')
  assert.deepEqual(axisNames(multiscale.axes), ['y', 'x'])
  assert.deepEqual(multiscale.datasets, [{ path: '1', coordinateTransformations: [{ type: 'scale', scale: [1.108, 1.108] }] }])
  assert.equal(files['.zattrs'].omero, undefined)
  assert.deepEqual(plan.arrays, [{ path: '1', copies: [{ source: '0/0/21/0/0', target: '0/0' }] }])
})

test('nested dataset paths get their intermediate groups, and an unknown level is refused', () => {
  const source = v2Source()
  const nested = {
    ...source,
    attributes: {
      multiscales: [{ ...source.attributes.multiscales[0], datasets: [{ path: 'scale0/image', coordinateTransformations: [] }] }],
    },
    arrays: { 'scale0/image': source.arrays[0] },
  }
  const files = Object.fromEntries(reducedStoreMetadata({ ...nested, selection: { t: 0, c: 0, z: 0 }, source: 's' }).files)
  assert.deepEqual(files['scale0/.zgroup'], { zarr_format: 2 })
  assert.ok(files['scale0/image/.zarray'])
  assert.throws(
    () => reducedStoreMetadata({ ...source, selection: { t: 0 }, levels: ['9'], source: 's' }),
    /None of the levels 9 is in the source/,
  )
})

test('a group without multiscales metadata is refused in either format', () => {
  assert.throws(() => multiscalesOf({ ome: { version: '0.5' } }, 3), /no ome\.multiscales attribute/)
  assert.throws(() => multiscalesOf({ multiscales: [] }, 2), /no multiscales attribute/)
  assert.deepEqual(multiscalesOf(v3Source().attributes, 3).version, '0.5')
  assert.deepEqual(multiscalesOf(v2Source().attributes, 2).version, '0.4')
})

test('a multiscales-level transform is reduced to the kept axes like the per-level ones', () => {
  const source = v2Source()
  const [multiscale] = source.attributes.multiscales
  const attributes = {
    multiscales: [{ ...multiscale, coordinateTransformations: [{ type: 'scale', scale: [2, 1, 3, 4, 5] }] }],
  }
  const files = Object.fromEntries(
    reducedStoreMetadata({ ...source, attributes, selection: { t: 0, c: 0 }, levels: ['1'], source: 's' }).files,
  )
  assert.deepEqual(files['.zattrs'].multiscales[0].coordinateTransformations, [{ type: 'scale', scale: [3, 4, 5] }])
  // A source with none gets none.
  const plain = Object.fromEntries(reducedStoreMetadata({ ...source, selection: { t: 0, c: 0 }, source: 's' }).files)
  assert.equal('coordinateTransformations' in plain['.zattrs'].multiscales[0], false)
})

test('a v3 array without dimension names or a key encoding keeps neither and uses the default keys', () => {
  const meta = structuredClone(v3Source().arrays[0])
  delete meta.dimension_names
  delete meta.chunk_key_encoding
  const fixed = [
    { index: 0, name: 't', value: 3 },
    { index: 1, name: 'c', value: 0 },
  ]
  const reduced = reduceArrayMetadata(meta, 3, [2, 3, 4], fixed)
  assert.equal('dimension_names' in reduced, false)
  assert.deepEqual(chunkCopies(meta, reduced, 3, fixed), [{ source: 'c/3/0/0/0/0', target: 'c/0/0/0' }])

  // Unsharded the same way, in the inner mode.
  const inner = reduceArrayMetadata(meta, 3, [3, 4], [...fixed, { index: 2, name: 'z', value: 7 }])
  assert.equal('dimension_names' in inner, false)
  assert.deepEqual(inner.chunk_grid.configuration.chunk_shape, [333, 333])
})
