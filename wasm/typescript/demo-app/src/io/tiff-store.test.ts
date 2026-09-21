// Unit tests for the TIFF store helpers. TIFFs are built in memory with
// fiff's own writer (strip-based; plain and deflate; with and without an
// OME-XML description; a two-level SubIFD pyramid) and opened from an
// ArrayBuffer, because geotiff's Blob path needs the browser `FileReader`.
// The URL path and the deflate worker pool are browser-only and are
// covered by the Playwright specs. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildTiff, makeImageTags, type WritableIfd } from '@fideus-labs/fiff'

import {
  DEFAULT_TIFF_POOL_SIZE,
  isOmeTiffStore,
  openTiffStore,
  poolSizeForCores,
  TIFF_STORE_VERSION,
  tiffPoolSize,
  tiffStoreAsOmeZarrStore,
} from './tiff-store.ts'

const WIDTH = 32
const HEIGHT = 16

/** A ramp so chunk bytes can be compared. */
function ramp(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height).map((_, index) => index % 251)
}

const PLANE = ramp(WIDTH, HEIGHT)

const OME_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<OME xmlns="http://www.openmicroscopy.org/Schemas/OME/2016-06">' +
  '<Image ID="Image:0" Name="ramp">' +
  `<Pixels ID="Pixels:0" DimensionOrder="XYZCT" Type="uint8" SizeX="${WIDTH}" SizeY="${HEIGHT}" SizeZ="1" SizeC="1" SizeT="1"` +
  ' PhysicalSizeX="0.5" PhysicalSizeXUnit="mm" PhysicalSizeY="0.25" PhysicalSizeYUnit="mm">' +
  '<Channel ID="Channel:0:0" SamplesPerPixel="1"/><TiffData/></Pixels></Image></OME>'

interface TiffFixtureOptions {
  compression?: 'none' | 'deflate'
  omeXml?: string
  /** Attach a half-resolution SubIFD to make a two-level pyramid. */
  pyramid?: boolean
}

/** A strip-based uint8 TIFF as fiff's writer lays it out. */
async function tiffBytes({ compression = 'none', omeXml, pyramid = false }: TiffFixtureOptions = {}): Promise<ArrayBuffer> {
  const main: WritableIfd = {
    tags: makeImageTags(WIDTH, HEIGHT, 8, 1, compression, omeXml, false, 0),
    tiles: [PLANE],
  }
  if (pyramid) {
    main.subIfds = [
      {
        tags: makeImageTags(WIDTH / 2, HEIGHT / 2, 8, 1, compression, undefined, true, 0),
        tiles: [ramp(WIDTH / 2, HEIGHT / 2)],
      },
    ]
  }
  return buildTiff([main], { compression })
}

const decoder = new TextDecoder()

async function json(store: { get(key: string): Promise<Uint8Array | undefined> }, key: string): Promise<any> {
  const bytes = await store.get(key)
  assert.ok(bytes, `${key} should exist`)
  return JSON.parse(decoder.decode(bytes))
}

test('poolSizeForCores uses the core count when it is a positive integer', () => {
  assert.equal(poolSizeForCores(8), 8)
  assert.equal(poolSizeForCores(1), 1)
})

test('poolSizeForCores falls back to the default for missing or unusable counts', () => {
  assert.equal(poolSizeForCores(undefined), DEFAULT_TIFF_POOL_SIZE)
  assert.equal(poolSizeForCores(0), DEFAULT_TIFF_POOL_SIZE)
  assert.equal(poolSizeForCores(-2), DEFAULT_TIFF_POOL_SIZE)
  assert.equal(poolSizeForCores(Number.NaN), DEFAULT_TIFF_POOL_SIZE)
  assert.equal(poolSizeForCores(2.5), DEFAULT_TIFF_POOL_SIZE)
})

test('tiffPoolSize reads the runtime core count', () => {
  // Node 21+ has a navigator with hardwareConcurrency, like browsers.
  assert.equal(tiffPoolSize(), poolSizeForCores(globalThis.navigator?.hardwareConcurrency))
  assert.ok(tiffPoolSize() >= 1)
})

test('openTiffStore presents a plain TIFF as a one-level OME-Zarr 0.5 store', async () => {
  const store = await openTiffStore(await tiffBytes())
  assert.equal(store.levels, 1)
  assert.equal(store.dataType, 'uint8')
  assert.deepEqual(store.dimensionNames, ['y', 'x'])
  assert.deepEqual(store.getShape(0), [HEIGHT, WIDTH])
  assert.equal(isOmeTiffStore(store), false)

  const root = await json(store, '/zarr.json')
  assert.equal(root.node_type, 'group')
  assert.equal(root.attributes.ome.version, TIFF_STORE_VERSION)
  assert.deepEqual(
    root.attributes.ome.multiscales[0].axes.map((axis: { name: string }) => axis.name),
    ['y', 'x'],
  )
  assert.deepEqual(
    root.attributes.ome.multiscales[0].datasets.map((dataset: { path: string }) => dataset.path),
    ['0'],
  )

  const array = await json(store, '/0/zarr.json')
  assert.equal(array.node_type, 'array')
  assert.equal(array.data_type, 'uint8')
  assert.deepEqual(array.shape, [HEIGHT, WIDTH])
  // A strip-based file is served as one chunk per plane.
  assert.deepEqual(array.chunk_grid.configuration.chunk_shape, [HEIGHT, WIDTH])
  assert.deepEqual(array.codecs, [{ name: 'bytes', configuration: { endian: 'little' } }])

  const chunk = await store.get('/0/c/0/0')
  assert.ok(chunk)
  assert.deepEqual([...chunk], [...PLANE])
  assert.equal(await store.get('/1/zarr.json'), undefined)
})

test('openTiffStore decodes deflate strips without a worker pool', async () => {
  const store = await openTiffStore(await tiffBytes({ compression: 'deflate' }))
  const chunk = await store.get('/0/c/0/0')
  assert.ok(chunk)
  assert.deepEqual([...chunk], [...PLANE])
})

test('openTiffStore reads OME-XML into axis units, scales, and the image name', async () => {
  const store = await openTiffStore(await tiffBytes({ omeXml: OME_XML, compression: 'deflate' }))
  assert.equal(isOmeTiffStore(store), true)
  assert.equal(store.ome[0]?.name, 'ramp')

  const root = await json(store, '/zarr.json')
  const [multiscale] = root.attributes.ome.multiscales
  assert.equal(multiscale.name, 'ramp')
  assert.deepEqual(multiscale.axes, [
    { name: 'y', type: 'space', unit: 'millimeter' },
    { name: 'x', type: 'space', unit: 'millimeter' },
  ])
  assert.deepEqual(multiscale.datasets[0].coordinateTransformations, [{ type: 'scale', scale: [0.25, 0.5] }])
  assert.equal(root.attributes.ome.omero.channels.length, 1)

  const chunk = await store.get('/0/c/0/0')
  assert.ok(chunk)
  assert.deepEqual([...chunk], [...PLANE])
})

test('openTiffStore exposes OME-TIFF SubIFD pyramids as extra levels', async () => {
  // SubIFD pyramids are an OME-TIFF layout (bioformats2raw, raw2ometiff,
  // fiff's toOmeTiff); fiff's plain-TIFF indexer only follows the legacy
  // main-chain layout, so the OME-XML description is what makes level 1
  // readable here.
  const store = await openTiffStore(await tiffBytes({ pyramid: true, omeXml: OME_XML }))
  assert.equal(store.levels, 2)
  assert.deepEqual(store.getShape(0), [HEIGHT, WIDTH])
  assert.deepEqual(store.getShape(1), [HEIGHT / 2, WIDTH / 2])

  const root = await json(store, '/zarr.json')
  const { datasets } = root.attributes.ome.multiscales[0]
  assert.deepEqual(
    datasets.map((dataset: { path: string }) => dataset.path),
    ['0', '1'],
  )
  // Level scales are the OME physical sizes times the downsampling factor.
  assert.deepEqual(datasets[0].coordinateTransformations[0].scale, [0.25, 0.5])
  assert.deepEqual(datasets[1].coordinateTransformations[0].scale, [0.5, 1])

  const level1 = await json(store, '/1/zarr.json')
  assert.deepEqual(level1.shape, [HEIGHT / 2, WIDTH / 2])
  const chunk = await store.get('/1/c/0/0')
  assert.ok(chunk)
  assert.deepEqual([...chunk], [...ramp(WIDTH / 2, HEIGHT / 2)])
})

test('openTiffStore rejects bytes that are not a TIFF', async () => {
  await assert.rejects(openTiffStore(new TextEncoder().encode('not a tiff').buffer as ArrayBuffer))
})

test('tiffStoreAsOmeZarrStore returns the same store object', async () => {
  const store = await openTiffStore(await tiffBytes())
  const readable = tiffStoreAsOmeZarrStore(store)
  assert.equal(readable, store)
  assert.equal(typeof (readable as { get: unknown }).get, 'function')
})
