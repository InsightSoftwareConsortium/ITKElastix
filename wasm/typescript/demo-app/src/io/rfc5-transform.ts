// The registration result as OME-Zarr RFC-5 metadata: the named coordinate
// systems of the two inputs, the fixed-to-moving affine between them, and the
// two places it is written — embedded in the registered image's multiscales
// and as a standalone transform-only store.
//
// ngff-zarr does the arithmetic (`itkTransformToNgffTransform` decodes the
// ITK parameters, folds the center of rotation into the offset, changes frame
// from ITK physical space into the intrinsic systems, and permutes ITK's
// x,y,z component order into Zarr order); this module is the wiring plus the
// checks that a silently wrong matrix would otherwise slip past. See
// docs/decisions/ome-zarr-transform-output.md for the conventions.
//
// Keep this module free of DOM access so the Node unit tests can import it,
// which is why it imports `@fideus-labs/ngff-zarr` rather than the
// `/browser` entry load-image.ts uses: the package's `exports` map sends
// Vite to the same browser build under the `browser` condition and Node to
// the Node build, and every value used here is exported by both. Check
// `esm/browser-mod.d.ts` before adding another — TypeScript resolves types
// from the Node entry, so a value that only the Node build exports would
// typecheck and then fail in the browser.
import {
  createAxis,
  createCoordinateSystem,
  INTRINSIC_COORDINATE_SYSTEM_NAME,
  itkTransformToNgffTransform,
  memoryStoreToZip,
  type Affine,
  type Axis,
  type CoordinateSystem,
  type Multiscales,
  type NgffImage,
  type SupportedDims,
} from '@fideus-labs/ngff-zarr'
import type { TransformList } from 'itk-wasm'

import type { LoadedImage } from './load-image.ts'
import { ROOT_METADATA_KEY, type MemoryStore } from './ozx-store.ts'
import { withoutCompositeHeader } from './transform-list.ts'

/** OME-Zarr version the RFC-5 transform metadata is written at. */
export const TRANSFORM_OME_ZARR_VERSION = '0.6'

/** Coordinate system of the fixed image in the standalone transform store. */
export const FIXED_COORDINATE_SYSTEM_NAME = 'fixed'

/** Coordinate system of the moving image, in both stores. */
export const MOVING_COORDINATE_SYSTEM_NAME = 'moving'

/** `name` of the transformation, in both stores. */
export const FIXED_TO_MOVING_TRANSFORM_NAME = 'fixed_to_moving'

/**
 * Spatial axis names in Zarr (slowest-first) order. `itkImageToNgffImage`
 * names a scalar image's axes `['z', 'y', 'x'].slice(-ndim)`, so these are
 * also the dims of the registered image's intrinsic coordinate system.
 */
const SPATIAL_DIMS: readonly SupportedDims[] = ['z', 'y', 'x']

/**
 * Axis names of the space the registration ran in, in Zarr order: `['y',
 * 'x']` for a 2D pair, `['z', 'y', 'x']` for a 3D one.
 *
 * This is deliberately not `LoadedImage.ngffImage.dims`. That is the dims of
 * the *source* level, which may carry a 'c' or 't' axis and may have had a
 * single-slice spatial axis squeezed out before elastix saw it
 * (src/io/normalize.ts). elastix's transform, the registered image, and
 * therefore the intrinsic coordinate system the transform is embedded
 * against all live in this reduced space, and a transform built over the
 * source dims would be the wrong size for the systems it names — which
 * nothing downstream checks, since the v0.6 writer validates only the axis
 * arity of `mapAxis`-like transforms, not of an `affine`.
 */
export function registrationDims(dimension: 2 | 3): SupportedDims[] {
  return SPATIAL_DIMS.slice(-dimension)
}

/** The parts of a loaded input the builders below read. */
export type TransformFrame = Pick<LoadedImage, 'dimension' | 'ngffImage'>

/** Axis `type` for a dimension name, matching ngff-zarr's `toMultiscales`. */
function axisTypeFor(dim: string): 'space' | 'channel' | 'time' {
  if (dim === 'x' || dim === 'y' || dim === 'z') {
    return 'space'
  }
  if (dim === 'c') {
    return 'channel'
  }
  if (dim === 't') {
    return 'time'
  }
  throw new Error(`Cannot build an OME-Zarr coordinate system axis for the dimension '${dim}'`)
}

/**
 * An RFC-5 coordinate system named `name` over `dims`, carrying each axis's
 * unit and RFC-4 anatomical orientation from `image`. `dims` defaults to the
 * image's own axes; the transform builders pass {@link registrationDims}
 * instead, and the units and orientations are looked up by axis name, so a
 * source with extra 'c' or 't' axes still contributes its spatial metadata.
 *
 * Mirrors the axis construction in ngff-zarr's `toMultiscales`, so the
 * intrinsic system of a pyramid and a system built here describe the same
 * axis the same way.
 */
export function buildCoordinateSystem(
  name: string,
  image: Pick<NgffImage, 'dims' | 'axesUnits' | 'axesOrientations'>,
  dims: readonly string[] = image.dims,
): CoordinateSystem {
  const axes = dims.map((dim) => {
    const type = axisTypeFor(dim)
    // A channel axis carries no unit, as in `toMultiscales`.
    const unit = type === 'channel' ? undefined : image.axesUnits?.[dim]
    return createAxis(dim as SupportedDims, type, unit, image.axesOrientations?.[dim])
  })
  return createCoordinateSystem(name, axes)
}

/**
 * The fixed-to-moving mapping elastix produced, as an RFC-5 `affine` from
 * the coordinate system named `inputName` to the one named `outputName`.
 *
 * `frames` hands ngff-zarr both images so it can change from ITK physical
 * space (which folds in the direction matrix RFC-4 orientation implies) into
 * the two intrinsic systems exactly; without them the conversion is only
 * correct for images that carry no orientation.
 *
 * `simplify` is off, so the result is always an `affine` rather than
 * whichever of `identity`/`translation`/`scale`/`sequence` happens to
 * represent this particular registration — see the decision note.
 */
export function buildFixedToMovingTransform(
  transform: TransformList,
  fixed: TransformFrame,
  moving: TransformFrame,
  inputName: string,
  outputName: string,
): Affine {
  const converted = itkTransformToNgffTransform(
    withoutCompositeHeader(transform),
    registrationDims(fixed.dimension),
    false,
    { fixed: fixed.ngffImage, moving: moving.ngffImage },
  )
  if (converted.type !== 'affine') {
    throw new Error(
      `Expected an RFC-5 affine for the fixed-to-moving transform, got '${converted.type}'; simplification is disabled, so this is a bug`,
    )
  }
  return {
    ...converted,
    name: FIXED_TO_MOVING_TRANSFORM_NAME,
    input: { name: inputName },
    output: { name: outputName },
  }
}

/**
 * Throw unless `affine` is a well-formed RFC-5 affine between the two named
 * systems: an `output.axes.length` x `input.axes.length + 1` block (the
 * matrix with the translation as its last column) of finite numbers, naming
 * `input` and `output` as its endpoints.
 *
 * Worth doing explicitly. ngff-zarr's zod `CoordinateTransformationSchema`
 * is not reachable — it is exported by neither `mod` nor `browser-mod`, and
 * the package's `exports` map blocks the deep path — and it models
 * `input`/`output` as bare strings, where the writer, the reader, and RFC-5
 * itself all use `{ name }` objects, so it would reject what must be
 * written. Nor does the v0.6 writer check an `affine`'s arity against the
 * systems it names: a wrong-sized matrix is serialized without complaint,
 * and a NaN becomes a JSON `null`.
 */
export function assertTransformMatchesSystems(
  affine: Affine,
  input: CoordinateSystem,
  output: CoordinateSystem,
): void {
  const rows = output.axes.length
  const columns = input.axes.length + 1
  const shape = `${affine.affine.length}x${affine.affine.map((row) => row.length).join('/')}`
  if (affine.affine.length !== rows || affine.affine.some((row) => row.length !== columns)) {
    throw new Error(
      `The fixed-to-moving affine is ${shape}, but a transform from '${input.name}' (${input.axes.length} axes) ` +
        `to '${output.name}' (${output.axes.length} axes) must be ${rows}x${columns}`,
    )
  }
  if (affine.affine.some((row) => row.some((value) => !Number.isFinite(value)))) {
    throw new Error(
      `The fixed-to-moving affine holds a non-finite value: ${JSON.stringify(affine.affine)}. ` +
        'OME-Zarr would store it as null, so the transform is refused instead.',
    )
  }
  for (const [side, identifier, system] of [
    ['input', affine.input, input],
    ['output', affine.output, output],
  ] as const) {
    if (identifier?.name !== system.name) {
      throw new Error(
        `The fixed-to-moving affine names '${identifier?.name ?? '(none)'}' as its ${side} coordinate system, ` +
          `but '${system.name}' is the one being written`,
      )
    }
  }
}

/**
 * Attach `affine` to the registered image's multiscales so the v0.6 writer
 * serializes it on the `multiscales[0]` entry.
 *
 * The registered image sits on the fixed image's grid, so its own intrinsic
 * system is the transform's input; `movingSystem` is listed alongside it
 * because `buildV06MultiscalesEntry` requires every multiscale-level
 * transformation to name both endpoints and refuses a name it cannot
 * resolve. The intrinsic system is rebuilt from `metadata.axes`, which is
 * what the writer actually serializes as `coordinateSystems[0].axes`,
 * keeping its own name when `toMultiscales` already provided one.
 *
 * Mutates and returns `multiscales`: `NgffMultiscales.metadata` is a plain
 * mutable object and the pyramid's images are large, so there is nothing to
 * gain from copying.
 */
export function embedInMultiscales(
  multiscales: Multiscales,
  affine: Affine,
  movingSystem: CoordinateSystem,
): Multiscales {
  const { metadata } = multiscales
  const intrinsicName = metadata.coordinateSystems?.[0]?.name ?? INTRINSIC_COORDINATE_SYSTEM_NAME
  const intrinsicSystem = createCoordinateSystem(intrinsicName, metadata.axes)
  assertTransformMatchesSystems(affine, intrinsicSystem, movingSystem)
  metadata.coordinateSystems = [intrinsicSystem, movingSystem]
  metadata.coordinateTransformations = [affine]
  return multiscales
}

/**
 * One axis as the v0.6 writer puts it on the wire. Mirrors ngff-zarr's
 * `processAxes`, which is internal to its writer: the standalone store's
 * root document is built here rather than by the writer, and duplicating
 * twelve lines beats emitting an axis shape the readers have not seen.
 */
function serializeAxis(axis: Axis): Record<string, unknown> {
  return {
    name: axis.name,
    type: axis.type,
    ...(axis.unit !== undefined && { unit: axis.unit }),
    ...(axis.discrete !== undefined && { discrete: axis.discrete }),
    ...(axis.orientation && { orientation: { type: axis.orientation.type, value: axis.orientation.value } }),
  }
}

function serializeCoordinateSystem(system: CoordinateSystem): Record<string, unknown> {
  return { name: system.name, axes: system.axes.map(serializeAxis) }
}

/**
 * The transform on its own, as a zipped OME-Zarr (RFC-9 `.ozx`) holding a
 * single group: no arrays, just the two coordinate systems and the affine
 * between them.
 *
 * RFC-5 puts a transformation between two images in a `scene` dictionary —
 * "Transformations between two or more images MUST be stored in the
 * attributes of a `scene` dictionary" — whose `coordinateTransformations` is
 * required and `coordinateSystems` optional, with `input` and `output` given
 * as objects carrying `name` and/or `path`. `multiscales` is the only other
 * home the RFC offers, and this store has no image to hang one on.
 */
export function transformOnlyOzx(
  affine: Affine,
  fixedSystem: CoordinateSystem,
  movingSystem: CoordinateSystem,
): Uint8Array {
  assertTransformMatchesSystems(affine, fixedSystem, movingSystem)
  const group = {
    zarr_format: 3,
    node_type: 'group',
    attributes: {
      ome: {
        version: TRANSFORM_OME_ZARR_VERSION,
        scene: {
          coordinateSystems: [fixedSystem, movingSystem].map(serializeCoordinateSystem),
          coordinateTransformations: [affine],
        },
      },
    },
  }
  const store: MemoryStore = new Map([[ROOT_METADATA_KEY, new TextEncoder().encode(JSON.stringify(group))]])
  return memoryStoreToZip(store, { version: TRANSFORM_OME_ZARR_VERSION })
}

/**
 * Everything the two writers need from one registration: the affine, the
 * intrinsic-named form for the registered image's own store, and the named
 * systems of both inputs.
 */
export interface Rfc5TransformSet {
  /** From the fixed image's `"fixed"` system to the moving image's. */
  standalone: Affine
  /** The same mapping, from the registered image's intrinsic system. */
  embedded: Affine
  /** The fixed image's axes, named `"fixed"`. */
  fixedSystem: CoordinateSystem
  /** The moving image's axes, named `"moving"`. */
  movingSystem: CoordinateSystem
}

/**
 * Build both forms of the fixed-to-moving transform for one registration.
 * The matrix is converted once; only the coordinate system the input names
 * differs, because the standalone store has to name the fixed image's system
 * explicitly while the embedded one is the registered image's own intrinsic
 * system.
 */
export function buildRfc5TransformSet(
  transform: TransformList,
  fixed: TransformFrame,
  moving: TransformFrame,
): Rfc5TransformSet {
  const dims = registrationDims(fixed.dimension)
  const fixedSystem = buildCoordinateSystem(FIXED_COORDINATE_SYSTEM_NAME, fixed.ngffImage, dims)
  const movingSystem = buildCoordinateSystem(MOVING_COORDINATE_SYSTEM_NAME, moving.ngffImage, dims)
  const standalone = buildFixedToMovingTransform(
    transform,
    fixed,
    moving,
    FIXED_COORDINATE_SYSTEM_NAME,
    MOVING_COORDINATE_SYSTEM_NAME,
  )
  assertTransformMatchesSystems(standalone, fixedSystem, movingSystem)
  return {
    standalone,
    embedded: { ...standalone, input: { name: INTRINSIC_COORDINATE_SYSTEM_NAME } },
    fixedSystem,
    movingSystem,
  }
}
