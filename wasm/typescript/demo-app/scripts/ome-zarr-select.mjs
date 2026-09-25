// Plans a reduced copy of a remote OME-Zarr image: fix some axes (a time
// point, a channel, a z plane) at one index each and keep the rest, for the
// sample pairs that are two time points of one time-lapse. The copy reuses
// the source's encoded chunks byte for byte, which is valid because every
// fixed axis has chunk extent 1: such a chunk holds exactly one index along
// that axis, and dropping a length-1 axis never changes the order of the
// elements a chunk (or a shard and its index) encodes. Nothing is decoded,
// so any codec the source uses carries over. Zarr v2 (OME-Zarr 0.4) and v3
// (0.5, sharded or not) are supported. A sharded array whose shards span a
// fixed axis (one shard per time point holding the whole z-stack, say) but
// whose inner chunks do not is copied unsharded: each chunk of the copy is
// one inner chunk, located through the shard's index. Pure functions over
// parsed metadata; scripts/fetch-samples.mjs does the I/O.

/** Axis names of a multiscales entry; OME-Zarr 0.3 lists bare strings. */
export function axisNames(axes) {
  return axes.map((axis) => (typeof axis === 'string' ? axis : axis.name))
}

/** The multiscales entry and OME-Zarr version of a root group's attributes. */
export function multiscalesOf(attributes, zarrFormat) {
  if (zarrFormat === 3) {
    const ome = attributes.ome
    if (!ome?.multiscales?.length) {
      throw new Error('The group has no ome.multiscales attribute')
    }
    return { multiscale: ome.multiscales[0], version: ome.version }
  }
  if (!attributes.multiscales?.length) {
    throw new Error('The group has no multiscales attribute')
  }
  return { multiscale: attributes.multiscales[0], version: attributes.multiscales[0].version }
}

/**
 * Split the axes into those kept and those fixed by `selection` (axis name
 * to index). Throws for a selected axis the image does not have.
 */
export function splitAxes(names, selection) {
  for (const name of Object.keys(selection)) {
    if (!names.includes(name)) {
      throw new Error(`Cannot select ${name}=${selection[name]}: the image has axes ${names.join(', ')}`)
    }
  }
  const kept = []
  const fixed = []
  names.forEach((name, index) => {
    if (name in selection) {
      fixed.push({ index, name, value: selection[name] })
    } else {
      kept.push(index)
    }
  })
  return { kept, fixed }
}

function pick(values, kept) {
  return kept.map((index) => values[index])
}

/** Scale and translation transforms reduced to the kept axes. */
export function reduceTransforms(transforms = [], kept) {
  return transforms.map((transform) => {
    const reduced = { ...transform }
    for (const key of ['scale', 'translation']) {
      if (Array.isArray(transform[key])) {
        reduced[key] = pick(transform[key], kept)
      }
    }
    return reduced
  })
}

/** Grid shape of the chunks (shards, for a sharded v3 array) that tile `shape`. */
function outerChunkShape(meta, zarrFormat) {
  return zarrFormat === 3 ? meta.chunk_grid.configuration.chunk_shape : meta.chunks
}

/** The sharding codec of a v3 array, or undefined for an unsharded one. */
function shardingOf(meta, zarrFormat) {
  return zarrFormat === 3 ? meta.codecs.find((codec) => codec.name === 'sharding_indexed')?.configuration : undefined
}

/**
 * How the fixed axes can be copied: 'chunks' when each has chunk (or
 * shard) extent 1, 'inner' when a sharded array's shards span one but its
 * inner chunks do not. Throws otherwise, or for an index out of range.
 */
function copyMode(meta, zarrFormat, fixed, path) {
  const chunks = outerChunkShape(meta, zarrFormat)
  const sharding = shardingOf(meta, zarrFormat)
  let mode = 'chunks'
  for (const { index, name, value } of fixed) {
    if (!Number.isInteger(value) || value < 0 || value >= meta.shape[index]) {
      throw new Error(`${path}: ${name}=${value} is outside 0..${meta.shape[index] - 1}`)
    }
    if (chunks[index] === 1) {
      continue
    }
    if (sharding?.chunk_shape[index] === 1) {
      mode = 'inner'
      continue
    }
    throw new Error(`${path}: ${name} is chunked ${chunks[index]} deep, so one ${name} index cannot be copied without re-encoding`)
  }
  return mode
}

function reduceCodecs(codecs, kept, path) {
  return codecs.map((codec) => {
    if (codec.name === 'transpose') {
      throw new Error(`${path}: the transpose codec is not supported`)
    }
    if (codec.name !== 'sharding_indexed') {
      return codec
    }
    const { configuration } = codec
    return {
      ...codec,
      configuration: {
        ...configuration,
        chunk_shape: pick(configuration.chunk_shape, kept),
        codecs: reduceCodecs(configuration.codecs, kept, path),
      },
    }
  })
}

/**
 * Array metadata of the reduced copy; `path` names the array in errors. In
 * the 'inner' mode (see {@link copyMode}) the copy is unsharded: its chunks
 * are the source's inner chunks, encoded with the inner codecs.
 */
export function reduceArrayMetadata(meta, zarrFormat, kept, fixed, path = 'array') {
  if (copyMode(meta, zarrFormat, fixed, path) === 'inner') {
    const sharding = shardingOf(meta, zarrFormat)
    const reduced = {
      ...meta,
      shape: pick(meta.shape, kept),
      chunk_grid: { ...meta.chunk_grid, configuration: { ...meta.chunk_grid.configuration, chunk_shape: pick(sharding.chunk_shape, kept) } },
      codecs: reduceCodecs(sharding.codecs, kept, path),
      attributes: {},
    }
    if (meta.dimension_names) {
      reduced.dimension_names = pick(meta.dimension_names, kept)
    }
    return reduced
  }
  if (zarrFormat === 3) {
    const reduced = {
      ...meta,
      shape: pick(meta.shape, kept),
      chunk_grid: {
        ...meta.chunk_grid,
        configuration: { ...meta.chunk_grid.configuration, chunk_shape: pick(meta.chunk_grid.configuration.chunk_shape, kept) },
      },
      codecs: reduceCodecs(meta.codecs, kept, path),
      attributes: {},
    }
    if (meta.dimension_names) {
      reduced.dimension_names = pick(meta.dimension_names, kept)
    }
    return reduced
  }
  return { ...meta, shape: pick(meta.shape, kept), chunks: pick(meta.chunks, kept) }
}

/** Chunk key of grid position `indices` under the array's key encoding. */
export function chunkKey(meta, zarrFormat, indices) {
  if (zarrFormat === 3) {
    const { name, configuration } = meta.chunk_key_encoding ?? { name: 'default' }
    if (name === 'v2') {
      return indices.join(configuration?.separator ?? '.')
    }
    const separator = configuration?.separator ?? '/'
    return ['c', ...indices].join(separator)
  }
  return indices.join(meta.dimension_separator ?? '.')
}

/**
 * Where a shard's index sits and how to read it: `count` entries of an
 * offset and a byte length (little-endian uint64 each), followed by a
 * crc32c checksum when the index codecs include one.
 */
export function shardIndexLayout(sharding, shardShape) {
  const count = shardShape.reduce((product, extent, i) => product * (extent / sharding.chunk_shape[i]), 1)
  const checksum = (sharding.index_codecs ?? []).some((codec) => codec.name === 'crc32c') ? 4 : 0
  return { count, byteLength: count * 16 + checksum, location: sharding.index_location ?? 'end' }
}

/**
 * The byte range of inner chunk `entry` from a shard's index bytes, or null
 * for a chunk that was never written (both fields all ones).
 */
export function shardEntry(indexBytes, entry) {
  const view = new DataView(indexBytes.buffer, indexBytes.byteOffset, indexBytes.byteLength)
  const offset = view.getBigUint64(entry * 16, true)
  const byteLength = view.getBigUint64(entry * 16 + 8, true)
  if (offset === 0xffffffffffffffffn && byteLength === 0xffffffffffffffffn) {
    return null
  }
  return { offset: Number(offset), byteLength: Number(byteLength) }
}

/**
 * Every chunk of the reduced array, as `{ source, target }` keys relative to
 * the array: the target position in the reduced grid, and the same position
 * in the source grid with each fixed axis at its selected index. In the
 * 'inner' mode `source` is the shard holding the chunk, and `inner` its
 * entry in that shard's index, with the index's `layout`.
 */
export function chunkCopies(sourceMeta, reducedMeta, zarrFormat, fixed) {
  const chunks = outerChunkShape(reducedMeta, zarrFormat)
  const counts = reducedMeta.shape.map((extent, i) => Math.ceil(extent / chunks[i]))
  const sharding = shardingOf(sourceMeta, zarrFormat)
  const inner = !shardingOf(reducedMeta, zarrFormat) && sharding !== undefined
  const shardShape = outerChunkShape(sourceMeta, zarrFormat)
  const layout = inner ? shardIndexLayout(sharding, shardShape) : undefined
  const copies = []
  const position = counts.map(() => 0)
  const total = counts.reduce((product, count) => product * count, 1)
  for (let n = 0; n < total; n += 1) {
    const full = [...position]
    for (const { index, value } of fixed) {
      full.splice(index, 0, value)
    }
    const target = chunkKey(reducedMeta, zarrFormat, position)
    if (inner) {
      // `full` counts inner chunks; find the shard and the chunk's C-order slot in it.
      const perShard = shardShape.map((extent, i) => extent / sharding.chunk_shape[i])
      const shardPosition = full.map((p, i) => Math.floor(p / perShard[i]))
      const entry = full.reduce((slot, p, i) => slot * perShard[i] + (p - shardPosition[i] * perShard[i]), 0)
      copies.push({ source: chunkKey(sourceMeta, zarrFormat, shardPosition), target, inner: { entry, layout } })
    } else {
      copies.push({ source: chunkKey(sourceMeta, zarrFormat, full), target })
    }
    for (let axis = position.length - 1; axis >= 0; axis -= 1) {
      position[axis] += 1
      if (position[axis] < counts[axis]) {
        break
      }
      position[axis] = 0
    }
  }
  return copies
}

/**
 * The metadata files of the reduced store, as `[relative path, JSON value]`:
 * the root group with its multiscales reduced (only the `levels` kept, when
 * given) and a `derivedFrom` note, a group for every intermediate path
 * segment, and each level's array. `arrays` maps a dataset path to its
 * source array metadata.
 */
export function reducedStoreMetadata({ zarrFormat, attributes, arrays, selection, levels, source }) {
  const { multiscale, version } = multiscalesOf(attributes, zarrFormat)
  const names = axisNames(multiscale.axes)
  const { kept, fixed } = splitAxes(names, selection)
  const datasets = multiscale.datasets.filter((dataset) => !levels || levels.includes(dataset.path))
  if (datasets.length === 0) {
    throw new Error(`None of the levels ${levels.join(', ')} is in the source`)
  }
  const reducedMultiscale = {
    ...multiscale,
    axes: pick(multiscale.axes, kept),
    datasets: datasets.map((dataset) => ({
      ...dataset,
      coordinateTransformations: reduceTransforms(dataset.coordinateTransformations, kept),
    })),
  }
  if (multiscale.coordinateTransformations) {
    reducedMultiscale.coordinateTransformations = reduceTransforms(multiscale.coordinateTransformations, kept)
  }
  const derivedFrom = { url: source, selection }
  const files = []
  const groups = new Set()
  if (zarrFormat === 3) {
    files.push([
      'zarr.json',
      { zarr_format: 3, node_type: 'group', attributes: { ome: { version, multiscales: [reducedMultiscale] }, derivedFrom } },
    ])
  } else {
    files.push(['.zgroup', { zarr_format: 2 }])
    files.push(['.zattrs', { multiscales: [reducedMultiscale], derivedFrom }])
  }
  const arrayPlans = []
  for (const dataset of datasets) {
    const segments = dataset.path.split('/')
    for (let depth = 1; depth < segments.length; depth += 1) {
      groups.add(segments.slice(0, depth).join('/'))
    }
    const meta = arrays[dataset.path]
    const reduced = reduceArrayMetadata(meta, zarrFormat, kept, fixed, dataset.path)
    files.push(zarrFormat === 3 ? [`${dataset.path}/zarr.json`, reduced] : [`${dataset.path}/.zarray`, reduced])
    arrayPlans.push({ path: dataset.path, copies: chunkCopies(meta, reduced, zarrFormat, fixed) })
  }
  for (const group of groups) {
    files.push(zarrFormat === 3 ? [`${group}/zarr.json`, { zarr_format: 3, node_type: 'group', attributes: {} }] : [`${group}/.zgroup`, { zarr_format: 2 }])
  }
  return { files, arrays: arrayPlans }
}
