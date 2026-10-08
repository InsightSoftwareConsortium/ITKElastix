// The registration result as OME-Zarr RFC-5 metadata: the named coordinate
// systems of the two inputs, the fixed-to-moving transform between them as a
// `sequence` holding one transformation per elastix stage (translation,
// rigid, affine), and the three places it is written — embedded in the
// registered image's multiscales, as a standalone transform-only store, and
// in an OME-Zarr scene between the fixed and moving images themselves.
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
  itkTransformToNgffMatrix,
  itkTransformToNgffTransform,
  memoryStoreToZip,
  NgffScene,
  type Affine,
  type Axis,
  type CoordinateSystem,
  type Multiscales,
  type NgffImage,
  type SupportedDims,
  type TransformSequence,
  type Translation,
  type V06Transform,
} from '@fideus-labs/ngff-zarr'
import type { Transform, TransformList } from 'itk-wasm'

import type { LoadedImage } from './load-image.ts'
import { ROOT_METADATA_KEY, type MemoryStore } from './ozx-store.ts'
import { toAffineTransform, withoutCompositeHeader, withTypedParameterArrays } from './transform-list.ts'

/** OME-Zarr version the RFC-5 transform metadata is written at. */
export const TRANSFORM_OME_ZARR_VERSION = '0.6'

/** Coordinate system of the fixed image in the standalone transform store. */
export const FIXED_COORDINATE_SYSTEM_NAME = 'fixed'

/** Coordinate system of the moving image, in both stores. */
export const MOVING_COORDINATE_SYSTEM_NAME = 'moving'

/** `name` of the transformation, in every store. */
export const FIXED_TO_MOVING_TRANSFORM_NAME = 'fixed_to_moving'

/**
 * Path of each input's image below the group of the OME-Zarr scene, named
 * for the part the image played in the registration.
 */
export const SCENE_IMAGE_PATHS = { fixed: 'fixed', moving: 'moving' } as const

/** An input's part in the registration, which names its image in the scene. */
export type SceneRole = keyof typeof SCENE_IMAGE_PATHS

/** The scene's two images, by the part each played in the registration. */
export type SceneImages = Readonly<Record<SceneRole, Multiscales>>

/**
 * `name` of each stage inside the sequence, by the ITK class elastix hands
 * the stage back as; any other class is named after itself, lower-cased.
 */
const STAGE_NAMES: Readonly<Record<string, string>> = {
  Translation: 'translation',
  Euler2D: 'rigid',
  Rigid2D: 'rigid',
  Euler3D: 'rigid',
  VersorRigid3D: 'rigid',
  Similarity2D: 'similarity',
  Similarity3D: 'similarity',
  Affine: 'affine',
}

/**
 * `name` of the stage a list with no stage written as an affine ends on,
 * when the fixed and moving images' frames differ.
 */
export const CHANGE_OF_FRAME_STAGE_NAME = 'change_of_frame'

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

function stageName(stage: Transform): string {
  const parameterization = String(stage.transformType.transformParameterization)
  return STAGE_NAMES[parameterization] ?? parameterization.toLowerCase()
}

/** How {@link stageTransformation} writes a stage. */
type StageForm = 'translation' | 'rigid' | 'affine'

function stageForm(stage: Transform): StageForm {
  if (stage.transformType.transformParameterization === 'Translation') {
    return 'translation'
  }
  return stageName(stage) === 'rigid' ? 'rigid' : 'affine'
}

/** Whether the M x M `matrix` is the identity, compared exactly. */
function isIdentityMatrix(matrix: number[][]): boolean {
  return matrix.every((row, i) => row.every((value, j) => value === (i === j ? 1 : 0)))
}

/**
 * One elastix stage as an RFC-5 transformation over `dims`, named for the
 * stage. The type follows the stage, not the values it holds, so a run whose
 * rigid stage found no rotation still writes the same shape:
 *
 * - the translation stage is a `translation`;
 * - the rigid stage is a `sequence` of a `rotation` and then a
 *   `translation`, since RFC-5 has no rigid type and a `rotation` carries
 *   no offset (`y = R x + b` rotates first and translates second);
 * - every other stage is an `affine`.
 *
 * `frames` is the change of frame on each side of this stage, as ngff-zarr's
 * `itkTransformToNgffTransform` takes it. A translation stage must be given
 * the same frame on both sides, and a rigid stage two frames that agree on
 * orientation, or it comes out as something else; see
 * {@link buildFixedToMovingTransform}.
 */
function stageTransformation(
  stage: Transform,
  dims: SupportedDims[],
  frames: { fixed: NgffImage; moving: NgffImage },
): Translation | Affine | TransformSequence {
  const name = stageName(stage)
  const form = stageForm(stage)
  if (form === 'translation') {
    const { matrix, offset } = itkTransformToNgffMatrix(stage, dims, frames)
    // An RFC-4 direction is a signed permutation, so conjugating the
    // identity by one is exact.
    if (!isIdentityMatrix(matrix)) {
      throw new Error(
        `The translation stage converted to the linear part ${JSON.stringify(matrix)} rather than the identity; ` +
          'its frames on both sides should agree on orientation, so this is a bug',
      )
    }
    return { type: 'translation', name, translation: offset }
  }
  const converted = itkTransformToNgffTransform(toAffineTransform(stage), dims, false, frames)
  if (converted.type !== 'affine') {
    throw new Error(
      `Expected an RFC-5 affine for the ${name} stage, got '${converted.type}'; simplification is disabled, so this is a bug`,
    )
  }
  if (form === 'affine') {
    return { type: 'affine', name, affine: converted.affine }
  }
  return {
    type: 'sequence',
    name,
    transformations: [
      { type: 'rotation', rotation: converted.affine.map((row) => row.slice(0, -1)) },
      { type: 'translation', translation: converted.affine.map((row) => row.at(-1)!) },
    ],
  }
}

/**
 * The change from the fixed image's intrinsic frame into the moving image's
 * as an `affine` stage named {@link CHANGE_OF_FRAME_STAGE_NAME}, or
 * undefined when it is the identity, as it is for two images without an
 * orientation. Only a list with no stage written as an affine needs it; see
 * {@link buildFixedToMovingTransform}.
 */
function changeOfFrameStage(fixed: TransformFrame, moving: TransformFrame, dims: SupportedDims[]): Affine | undefined {
  const identity: Transform = {
    transformType: {
      transformParameterization: 'Identity',
      parametersValueType: 'float64',
      inputDimension: dims.length,
      outputDimension: dims.length,
    },
    numberOfParameters: 0,
    numberOfFixedParameters: 0,
    name: '',
    inputSpaceName: '',
    outputSpaceName: '',
    parameters: new Float64Array(0),
    fixedParameters: new Float64Array(0),
  }
  const { matrix, offset } = itkTransformToNgffMatrix(identity, dims, {
    fixed: fixed.ngffImage,
    moving: moving.ngffImage,
  })
  if (isIdentityMatrix(matrix) && offset.every((value) => value === 0)) {
    return undefined
  }
  return { type: 'affine', name: CHANGE_OF_FRAME_STAGE_NAME, affine: matrix.map((row, i) => [...row, offset[i]!]) }
}

/**
 * The fixed-to-moving mapping elastix produced, as an RFC-5 `sequence` from
 * the coordinate system named `inputName` to the one named `outputName`,
 * holding one transformation per elastix stage in the order a point passes
 * through them: translation, rigid, then affine for the demo's run. ITK's
 * composite applies its last entry first, so that is the list read
 * backwards.
 *
 * Each stage is converted on its own, with ngff-zarr changing frame from
 * ITK physical space (which folds in the direction matrix RFC-4 orientation
 * implies) into the intrinsic systems. Writing `phi_f` and `phi_m` for the
 * fixed and moving images' intrinsic-to-physical maps, the mapping is
 * `phi_m^-1 . A . R . T . phi_f`, and it is split as
 *
 *     (phi_m^-1 . A . phi_f) . (phi_f^-1 . R . phi_f) . (phi_f^-1 . T . phi_f)
 *
 * so the translation and rigid stages run from the fixed image's intrinsic
 * frame back into it, and the affine stage also carries the change to the
 * moving image's. An RFC-4 direction is a signed permutation, so the
 * translation stays a translation and the rotation a proper rotation even
 * when the two images disagree about an axis direction — a change of frame
 * between two such images can be a mirror, which only an affine can hold.
 * The sequence composes, up to rounding, to the single affine the whole
 * list would convert to. Without both images the conversion would be
 * correct only for images that carry no orientation.
 *
 * For a list other than the demo's, the change of frame goes on the last
 * stage written as an affine; the stages before it stay in the fixed
 * image's frame and the ones after it run in the moving image's. A list
 * with no such stage keeps every stage in the fixed frame and ends on the
 * change of frame as an `affine` of its own ({@link changeOfFrameStage}),
 * unless that is the identity.
 *
 * `simplify` is off for the affine stages, so their type never depends on
 * the values a particular registration produced — see the decision note.
 *
 * The list is prepared first (src/io/transform-list.ts): elastix's
 * `Composite` header is dropped (`withoutCompositeHeader`); the zero-count
 * parameter fields that itk-wasm leaves as placeholder strings become empty
 * typed arrays (`withTypedParameterArrays`), or ngff-zarr counts the
 * string's characters as fixed parameters; and the rigid stage, which ITK
 * hands back as an `Euler2D` or `Euler3D` transform storing angles, is
 * rewritten as the equivalent `Affine` (`toAffineTransform`), since
 * ngff-zarr decodes only matrix-storing parameterizations. Its name comes
 * from the original class, so it is still written as the `rigid` stage.
 */
export function buildFixedToMovingTransform(
  transform: TransformList,
  fixed: TransformFrame,
  moving: TransformFrame,
  inputName: string,
  outputName: string,
): TransformSequence {
  const dims = registrationDims(fixed.dimension)
  const stages = withTypedParameterArrays(withoutCompositeHeader(transform)).toReversed()
  if (stages.length === 0) {
    throw new Error('The registration returned no transform stages, so there is no fixed-to-moving transform to write')
  }
  const pivot = stages.map(stageForm).lastIndexOf('affine')
  const transformations: V06Transform[] = stages.map((stage, index) =>
    stageTransformation(stage, dims, {
      fixed: (pivot === -1 || index <= pivot ? fixed : moving).ngffImage,
      moving: (pivot === -1 || index < pivot ? fixed : moving).ngffImage,
    }),
  )
  const changeOfFrame = pivot === -1 ? changeOfFrameStage(fixed, moving, dims) : undefined
  if (changeOfFrame !== undefined) {
    transformations.push(changeOfFrame)
  }
  // Keys in the order ngff-zarr's writer serializes them, so the standalone
  // store reads like the embedded one.
  return {
    type: 'sequence',
    name: FIXED_TO_MOVING_TRANSFORM_NAME,
    input: { name: inputName },
    output: { name: outputName },
    transformations,
  }
}

/** How far a `rotation`'s rows may be from orthonormal and still be written. */
const ROTATION_TOLERANCE = 1e-9

function determinant(matrix: number[][]): number {
  if (matrix.length === 1) {
    return matrix[0]![0]!
  }
  const minor = (column: number) => matrix.slice(1).map((row) => row.filter((_, k) => k !== column))
  return matrix[0]!.reduce((sum, value, column) => sum + (column % 2 === 0 ? 1 : -1) * value * determinant(minor(column)), 0)
}

/**
 * Throw unless `transform` is a well-formed fixed-to-moving sequence between
 * the two named systems: it names `input` and `output` as its endpoints, the
 * two have the same number of axes (a registration maps a space onto one of
 * its own dimension, and the intermediate spaces between stages are that
 * dimension too), and it holds at least one stage, each of them well formed
 * over that many axes ({@link assertStage}).
 *
 * Worth doing explicitly. ngff-zarr's zod `CoordinateTransformationSchema`
 * is not reachable — it is exported by neither `mod` nor `browser-mod`, and
 * the package's `exports` map blocks the deep path — and it models
 * `input`/`output` as bare strings, where the writer, the reader, and RFC-5
 * itself all use `{ name }` objects, so it would reject what must be
 * written. Nor does the v0.6 writer check an `affine`'s arity against the
 * systems it names or a `rotation`'s determinant: a wrong-sized matrix or a
 * mirror is serialized without complaint, and a NaN becomes a JSON `null`.
 */
export function assertTransformMatchesSystems(
  transform: TransformSequence,
  input: CoordinateSystem,
  output: CoordinateSystem,
): void {
  for (const [side, identifier, system] of [
    ['input', transform.input, input],
    ['output', transform.output, output],
  ] as const) {
    if (identifier?.name !== system.name) {
      throw new Error(
        `The fixed-to-moving transform names '${identifier?.name ?? '(none)'}' as its ${side} coordinate system, ` +
          `but '${system.name}' is the one being written`,
      )
    }
  }
  const dimension = input.axes.length
  if (output.axes.length !== dimension) {
    throw new Error(
      `The fixed-to-moving transform runs from '${input.name}' (${dimension} axes) to '${output.name}' ` +
        `(${output.axes.length} axes), but a registration maps between spaces with the same axes`,
    )
  }
  if (transform.type !== 'sequence' || transform.transformations.length === 0) {
    throw new Error('The fixed-to-moving transform must be a sequence holding at least one stage')
  }
  for (const stage of transform.transformations) {
    assertStage(stage, dimension, stage.name ?? stage.type)
  }
}

/**
 * Throw unless `stage`, found at `path` inside the fixed-to-moving sequence,
 * is one of the transformations this module writes, over `dimension` axes
 * and holding finite numbers: a `translation` of that length; an `affine` of
 * that many rows by one more column (the matrix with the translation as its
 * last column); a square `rotation` with orthonormal rows and a determinant
 * of one, as RFC-5 requires; or a non-empty `sequence` of those.
 */
function assertStage(stage: V06Transform, dimension: number, path: string): void {
  const label = `Stage '${path}' of the fixed-to-moving transform`
  let values: number[]
  switch (stage.type) {
    case 'translation':
      if (stage.translation.length !== dimension) {
        throw new Error(`${label} translates ${stage.translation.length} axes, but the coordinate systems have ${dimension}`)
      }
      values = stage.translation
      break
    case 'affine':
    case 'rotation': {
      const matrix = stage.type === 'affine' ? stage.affine : stage.rotation
      const columns = stage.type === 'affine' ? dimension + 1 : dimension
      if (matrix.length !== dimension || matrix.some((row) => row.length !== columns)) {
        const shape = `${matrix.length}x${matrix.map((row) => row.length).join('/')}`
        throw new Error(
          `${label} is a ${shape} ${stage.type}, but one over ${dimension} axes must be ${dimension}x${columns}`,
        )
      }
      values = matrix.flat()
      break
    }
    case 'sequence':
      if (stage.transformations.length === 0) {
        throw new Error(`${label} is an empty sequence`)
      }
      for (const inner of stage.transformations) {
        assertStage(inner, dimension, `${path}/${inner.name ?? inner.type}`)
      }
      return
    default:
      throw new Error(`${label} is a '${stage.type}'; only translation, rotation, affine, and sequence stages are written`)
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(
      `${label} holds a non-finite value: ${JSON.stringify(values)}. ` +
        'OME-Zarr would store it as null, so the transform is refused instead.',
    )
  }
  if (stage.type === 'rotation') {
    const { rotation } = stage
    const orthonormal = rotation.every((row, i) =>
      rotation.every((other, j) => {
        const dot = row.reduce((sum, value, k) => sum + value * other[k]!, 0)
        return Math.abs(dot - (i === j ? 1 : 0)) <= ROTATION_TOLERANCE
      }),
    )
    if (!orthonormal || determinant(rotation) < 0) {
      throw new Error(
        `${label} is not a proper rotation: RFC-5 requires orthonormal rows and a determinant of one, ` +
          `and ${JSON.stringify(rotation)} has determinant ${determinant(rotation)}`,
      )
    }
  }
}

/**
 * Attach `transform` to the registered image's multiscales so the v0.6 writer
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
  transform: TransformSequence,
  movingSystem: CoordinateSystem,
): Multiscales {
  const { metadata } = multiscales
  const intrinsicName = metadata.coordinateSystems?.[0]?.name ?? INTRINSIC_COORDINATE_SYSTEM_NAME
  const intrinsicSystem = createCoordinateSystem(intrinsicName, metadata.axes)
  assertTransformMatchesSystems(transform, intrinsicSystem, movingSystem)
  metadata.coordinateSystems = [intrinsicSystem, movingSystem]
  metadata.coordinateTransformations = [transform]
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
 * single group: no arrays, just the two coordinate systems and the staged
 * transform between them.
 *
 * RFC-5 puts a transformation between two images in a `scene` dictionary —
 * "Transformations between two or more images MUST be stored in the
 * attributes of a `scene` dictionary" — whose `coordinateTransformations` is
 * required and `coordinateSystems` optional, with `input` and `output` given
 * as objects carrying `name` and/or `path`. `multiscales` is the only other
 * home the RFC offers, and this store has no image to hang one on.
 */
export function transformOnlyOzx(
  transform: TransformSequence,
  fixedSystem: CoordinateSystem,
  movingSystem: CoordinateSystem,
): Uint8Array {
  assertTransformMatchesSystems(transform, fixedSystem, movingSystem)
  const group = {
    zarr_format: 3,
    node_type: 'group',
    attributes: {
      ome: {
        version: TRANSFORM_OME_ZARR_VERSION,
        scene: {
          coordinateSystems: [fixedSystem, movingSystem].map(serializeCoordinateSystem),
          coordinateTransformations: [transform],
        },
      },
    },
  }
  const store: MemoryStore = new Map([[ROOT_METADATA_KEY, new TextEncoder().encode(JSON.stringify(group))]])
  return memoryStoreToZip(store, { version: TRANSFORM_OME_ZARR_VERSION })
}

/**
 * The coordinate system that the end of `transform` on `role`'s side names,
 * as `images[role]` declares it: what ngff-zarr's scene writer and reader
 * resolve that end to. An image declaring no system of its own is written
 * with the intrinsic one, over its axes, as ngff-zarr's 0.6 writer does.
 * Throws when the end does not point at the image's path in the scene, or
 * when the image declares no system of that name.
 */
function sceneImageSystem(transform: TransformSequence, images: SceneImages, role: SceneRole): CoordinateSystem {
  const side = role === 'fixed' ? 'input' : 'output'
  const identifier = transform[side]
  const path = SCENE_IMAGE_PATHS[role]
  if (identifier?.path !== path) {
    throw new Error(
      `The fixed-to-moving transform's ${side} points at '${identifier?.path ?? '(no path)'}', ` +
        `but the scene keeps the ${role} image at '${path}'`,
    )
  }
  const { metadata } = images[role]
  const systems = metadata.coordinateSystems?.length
    ? metadata.coordinateSystems
    : [createCoordinateSystem(INTRINSIC_COORDINATE_SYSTEM_NAME, metadata.axes)]
  const system = systems.find((candidate) => candidate.name === identifier.name)
  if (system === undefined) {
    throw new Error(
      `The fixed-to-moving transform's ${side} names the coordinate system '${identifier.name ?? '(none)'}' ` +
        `of the ${role} image, which declares ${JSON.stringify(systems.map((candidate) => candidate.name))}`,
    )
  }
  return system
}

/**
 * The OME-Zarr scene of one registration: the fixed and moving images at
 * their {@link SCENE_IMAGE_PATHS} entries and the staged transform between
 * their intrinsic systems, for ngff-zarr's `toOmeZarrOzx` to write as
 *
 *     zarr.json      ome.scene: fixed_to_moving, fixed -> moving
 *     fixed/         the fixed image's multiscales
 *     moving/        the moving image's multiscales
 *
 * ngff-zarr checks a scene against the spec before it writes anything: that
 * both ends resolve, that the images and the transformation form one
 * connected graph, and that its reader accepts the transformation. This
 * checks first what that does not ({@link assertTransformMatchesSystems}),
 * against the systems the images declare, so an affine sized for other axes,
 * a rotation that is not proper, or a non-finite value is refused rather
 * than written.
 */
export function buildScene(transform: TransformSequence, images: SceneImages): NgffScene {
  assertTransformMatchesSystems(
    transform,
    sceneImageSystem(transform, images, 'fixed'),
    sceneImageSystem(transform, images, 'moving'),
  )
  return new NgffScene({
    images: { [SCENE_IMAGE_PATHS.fixed]: images.fixed, [SCENE_IMAGE_PATHS.moving]: images.moving },
    coordinateTransformations: [transform],
  })
}
/**
 * Everything the three writers need from one registration: the staged
 * transform, its intrinsic-named form for the registered image's own store,
 * its form between the images of the scene, and the named systems of both
 * inputs.
 */
export interface Rfc5TransformSet {
  /** From the fixed image's `"fixed"` system to the moving image's. */
  standalone: TransformSequence
  /** The same mapping, from the registered image's intrinsic system. */
  embedded: TransformSequence
  /**
   * The same mapping, from the intrinsic system of the scene's fixed image
   * to that of its moving image, each end naming the image by its path.
   */
  scene: TransformSequence
  /** The fixed image's axes, named `"fixed"`. */
  fixedSystem: CoordinateSystem
  /** The moving image's axes, named `"moving"`. */
  movingSystem: CoordinateSystem
}

/**
 * Build every form of the fixed-to-moving transform for one registration.
 * The stages are converted once; only the coordinate systems the ends name
 * differ. The standalone store has to name the fixed image's system
 * explicitly, the embedded one starts from the registered image's own
 * intrinsic system, and the scene's runs between the intrinsic systems of
 * its two images, which hold the levels elastix registered and therefore
 * sit in the frames the stages were converted for.
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
    scene: {
      ...standalone,
      input: { path: SCENE_IMAGE_PATHS.fixed, name: INTRINSIC_COORDINATE_SYSTEM_NAME },
      output: { path: SCENE_IMAGE_PATHS.moving, name: INTRINSIC_COORDINATE_SYSTEM_NAME },
    },
    fixedSystem,
    movingSystem,
  }
}
