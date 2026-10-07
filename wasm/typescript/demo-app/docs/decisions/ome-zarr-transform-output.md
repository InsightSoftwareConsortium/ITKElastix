---
type: note
title: OME-Zarr transform output conventions
created: 2026-09-21
tags:
  - ome-zarr
  - rfc-5
  - elastix
  - transforms
related:
  - '[[architecture-overview]]'
---

# OME-Zarr transform output conventions

The demo writes the registration result's fixed-to-moving transform as
[OME-Zarr RFC-5](https://ngff.openmicroscopy.org/rfc/5/) coordinate-transformation
metadata, one transformation per elastix stage, in two places: embedded in
the registered image's own OZX, and as a
standalone transform-only OZX the transform picker offers. Both come from
`src/io/rfc5-transform.ts`. This note records the conventions that file
encodes, because each of them is a choice whose wrong version still writes a
file that looks valid. Part of [[architecture-overview]].

## Direction: fixed to moving

elastix's output transform maps points of the **fixed** image into the
**moving** image. That is the direction resampling needs — for each point on
the fixed grid, find where to sample the moving image — and it is the
direction ITK's `CompositeTransform` from `elastix-wasm.cxx` carries. The
RFC-5 transformation therefore has the fixed image's coordinate system as its
`input` and the moving image's as its `output`. It is *not* the mapping that
would carry the moving image onto the fixed one; that is its inverse.

The registered result image sits on the fixed image's grid, so when the
transform is embedded in that image's store, the input system is the
registered image's own intrinsic system.

## Coordinate system names

| Store | `input` | `output` |
| --- | --- | --- |
| Registered image OZX (`multiscales[0]`) | `intrinsic` | `moving` |
| Transform-only OZX (`scene`) | `fixed` | `moving` |

`intrinsic` is not a name this app picks: it is ngff-zarr's
`INTRINSIC_COORDINATE_SYSTEM_NAME`, the implicit system `toMultiscales`
generates for a pyramid and that every dataset's scale-and-translation
sequence maps into. RFC-5 requires a transformation on a `multiscales` entry
to name that system as its input, so the embedded form has no other choice.
The standalone store has no image and therefore no intrinsic system, so it
names the fixed image's system explicitly.

Both systems carry the axis units and RFC-4 anatomical orientations of the
image they describe, so a reader can tell that, say, the moving image's `x`
runs right-to-left while the fixed image's runs left-to-right.

## The transform lives in registration space, not source space

The coordinate systems are built over the axes elastix actually registered in
— `['y', 'x']` for a 2D pair, `['z', 'y', 'x']` for a 3D one — and not over
the source level's `dims`. Ingest (`src/io/normalize.ts`) reduces each input
to one time point and one channel and squeezes a single-slice volume to 2D
before elastix sees it, so an RGB PNG's `c` axis and a one-slice NIfTI's `z`
axis are both gone by then. A transform built over the source `dims` would be
the wrong size for the systems it names, and nothing downstream would say so:
the v0.6 writer checks the axis arity of `mapAxis`-like transformations but
not of an `affine`. `assertTransformMatchesSystems` is the check that would
otherwise be missing.

## One transformation per stage

elastix optimizes the demo's transform in three stages — translation, rigid,
affine — each starting from the result of the one before. The OME-Zarr
outputs keep those stages apart instead of writing the single affine they
compose to: the transformation is an RFC-5 `sequence` whose
`transformations` are the stages in the order a point passes through them.
RFC-5 applies a sequence's first entry first, and ITK's composite list
applies its last entry first, so the sequence is that list read backwards.

Each stage carries a `name` from the ITK class elastix hands it back as —
`translation` for `Translation`, `rigid` for `Euler2D` and `Euler3D`,
`affine` for `Affine` — and no `input` or `output`, which RFC-5 allows for a
transformation wrapped in a `sequence`. A reader that wants one matrix
composes the sequence (ngff-zarr's `ngffTransformToItkTransform` does, back
into one ITK affine); a reader that wants to know what each stage found, or
to apply the rigid part alone, reads it off.

The type of each stage follows the stage, never the values a particular run
produced:

| Stage | RFC-5 type | Why |
| --- | --- | --- |
| translation | `translation` | RFC-5 prefers it to the equivalent affine, and it stays a pure translation in the frame it is written in (below). |
| rigid | `sequence` of a `rotation`, then a `translation` | RFC-5 has no rigid type, and a `rotation` carries no offset, while ITK rotates about a center: `y = R (x - c) + t + c` is `R x + b` with `b = t + c - R c`, which rotates first and translates second. RFC-5 prefers a `rotation` to the equivalent affine, and keeping it separate lets a reader see that the stage is rigid without testing the matrix. |
| affine | `affine` | |

The rigid stage's inner transformations carry neither a `name` nor `input`
or `output`. RFC-5 requires a `rotation` to have orthonormal rows and a
determinant of one, which the v0.6 writer does not check, so
`assertTransformMatchesSystems` does, along with every stage's shape; the
frame each stage is written in (below) is what keeps the determinant at one.

`itkTransformToNgffTransform` is called with `simplify: false` for the rigid
and affine stages, so neither turns into the least expressive form that happens
to fit — `identity` for a stage that found nothing to do, `scale` or a
`sequence` of scale and translation for an axis-aligned one, `translation`
for a pure shift. Three reasons:

1. **One shape for consumers.** The transform is the demo's output; a reader
   that can rely on three stages of fixed types is better off than one that
   has to branch on what this run happened to find.
2. **The same object is written twice.** The embedded and standalone forms
   differ only in the name of their input system, so they must agree on
   type as well as numbers.
3. **`scale` cannot carry a mirror.** RFC-5 requires strictly positive scale
   factors, so a diagonal matrix with a negative entry — an ordinary result
   when the two images disagree about an axis direction — falls through to
   `affine` anyway. Making that the only case where the type changes would be
   the worst of both.

Each affine is the upper *M* x (*N*+1) block: the linear part with the
translation as its last column. For the 2D sample that is two rows of three
values.

## The frame each stage is written in

An ITK transform acts on physical space, which includes the direction matrix
RFC-4 orientation implies; an RFC-5 transformation acts on the intrinsic
coordinate systems. Writing φ_f and φ_m for the fixed and moving images'
intrinsic-to-physical maps (φ(p) = D (p − o) + o) and T, R, A for the three
stages, the whole mapping is φ_m⁻¹ · A · R · T · φ_f. That splits into
stages in more than one way. The demo writes

```text
(φ_m⁻¹ · A · φ_f) · (φ_f⁻¹ · R · φ_f) · (φ_f⁻¹ · T · φ_f)
```

so the translation and rigid stages map the fixed image's intrinsic frame
into itself, and the affine stage, last, also carries the change into the
moving image's. An RFC-4 direction is a signed permutation, so conjugating
by one keeps a translation a translation — exactly, since the identity's
entries stay 0 and 1, which is why `buildFixedToMovingTransform` can check
the translation stage's linear part with `!==` — and a rotation a proper
rotation, though a mirror reverses its sense. The change between two
frames, by contrast, is a mirror whenever the two images disagree about an
odd number of axis directions, and only an affine can hold one. Putting it
on the first stage instead would turn the translation into a flip plus a
shift, and putting it on the rigid stage could leave that stage's
`rotation` with a determinant of −1, which RFC-5 does not allow.

In ngff-zarr's terms, each stage goes through `itkTransformToNgffTransform`
on its own, with `frames` set to `{ fixed, moving: fixed }` for the
translation and rigid stages and `{ fixed, moving }` for the affine one. The
spaces between stages are unnamed and share the fixed image's axes. The
product is the single affine the whole list converts to, up to rounding;
the unit tests check that for a fixed image flipped against the moving one,
and that ngff-zarr's own reader composes the sequence back to the same ITK
transform.

A caller of `registerAffine` may pass its own parameter object, so the
builder does not assume the demo's three stages. The change of frame goes
on the last stage written as an affine; stages before it stay in the fixed
image's frame and stages after it run in the moving image's, where a
translation and a rotation keep their form just the same. A list with no
stage written as an affine — translation and rigid only — keeps every stage
in the fixed frame and ends on the change of frame as an `affine` of its
own, named `change_of_frame`, unless that change is the identity, as it is
for two images without an orientation.

## Where the standalone transform lives: `scene`, not the group root

RFC-5 names three places a transformation may be stored — `multiscales >
datasets`, `multiscales > coordinateTransformations`, and `scene >
coordinateTransformations` — and says that "transformations between two or
more images MUST be stored in the attributes of a `scene` dictionary". A
transform-only store has no image to hang a `multiscales` on, so `scene` is
the only conformant home, and the group's `zarr.json` reads:

```json
{
  "zarr_format": 3,
  "node_type": "group",
  "attributes": {
    "ome": {
      "version": "0.6",
      "scene": {
        "coordinateSystems": [{ "name": "fixed", "axes": [] }, { "name": "moving", "axes": [] }],
        "coordinateTransformations": [
          {
            "type": "sequence",
            "name": "fixed_to_moving",
            "input": { "name": "fixed" },
            "output": { "name": "moving" },
            "transformations": [
              { "type": "translation", "name": "translation", "translation": [0, 0] },
              {
                "type": "sequence",
                "name": "rigid",
                "transformations": [
                  { "type": "rotation", "rotation": [[1, 0], [0, 1]] },
                  { "type": "translation", "translation": [0, 0] }
                ]
              },
              { "type": "affine", "name": "affine", "affine": [[1, 0, 0], [0, 1, 0]] }
            ]
          }
        ]
      }
    }
  }
}
```

`input` and `output` are objects carrying `name` and/or `path`, which is both
what RFC-5 specifies for a scene and what ngff-zarr's writer and reader use.
(ngff-zarr also ships a zod `CoordinateTransformationSchema` that models them
as bare strings, from an earlier draft. It is unusable here in any case: it is
exported by neither the Node nor the browser entry point, and the package's
`exports` map blocks the deep path to it. `assertTransformMatchesSystems`
validates instead, and checks more than the schema would.)

The document is written into a one-entry `MemoryStore` and zipped with
ngff-zarr's `memoryStoreToZip` at version `0.6`, so the archive is an RFC-9
`.ozx` with the version in its ZIP comment, and `src/io/ozx-store.ts` reads it
back. The transform picker's `ozx-transform` entry reaches it through
`exportRegisteredTransform` (`src/io/export-transform.ts`), which also serves
the ITK-Wasm transform formats and the elastix parameter JSON; those two
carry the elastix stages as ITK and elastix store them, and the OME-Zarr
outputs carry the same stages as the RFC-5 transformations described here.

## The list is prepared before ngff-zarr sees it

elastix returns its transform as an itk-wasm `TransformList` that, for the
demo's translation → rigid → affine run, reads `[Composite, Affine, Euler2D,
Translation]` in 2D and `[Composite, Affine, Euler3D, Translation]` in 3D
(ITK composite order: the *last* entry is applied first). ITK's writers take
that list as is; `itkTransformToNgffTransform` needs three things done to it
first, all in `src/io/transform-list.ts`:

1. **The `Composite` header has to go.** The first entry is a parameterless
   `Composite` marker, and ngff-zarr refuses a `Composite` entry wherever it
   appears: a *nested* composite serializes as the same parameterless entry
   with its children dropped, and the two are indistinguishable.
   `withoutCompositeHeader` drops the leading marker and leaves any later
   one in place, so the refusal still fires where it should.
2. **Zero-count parameter fields must be typed arrays.** itk-wasm leaves
   the `data:application/vnd.itk.address,0:0` placeholder string in a field
   whose count is zero (the `Translation` stage has no fixed parameters),
   and ngff-zarr reads the string's length as "36 fixed parameters".
   `withTypedParameterArrays`, which the ITK writers already needed for the
   same reason, substitutes empty typed arrays.
3. **The rigid stage has to become an affine.** ITK hands the rigid stage
   back as `Euler2D` (`[angle, tx, ty]`) or `Euler3D` (`[ax, ay, az, tx, ty,
   tz]`, with the `ComputeZYX` flag as a fourth fixed parameter after the
   center), and ngff-zarr decodes only parameterizations that store a
   matrix: "Convert it to an Affine transform first." `toAffineTransform`
   does that, computing the matrix exactly as the ITK class does (`Rz Rx
   Ry` by default, `Rz Ry Rx` with `ComputeZYX`; `[[cos, -sin], [sin,
   cos]]` in 2D; ITK's `Versor::GetMatrix` for the versor-based
   `VersorRigid3D` and `Similarity3D`; the scale folded in for the
   similarity classes) and carrying the translation and center of rotation
   over unchanged, so the affine maps every point where the original did.
   The conventions were checked against the ITK sources
   (`itkEuler3DTransform.hxx`, `itkRigid2DTransform.hxx`,
   `itkSimilarity2DTransform.hxx`, `itkSimilarity3DTransform.hxx`,
   `itkVersorRigid3DTransform.hxx`, `itkVersor.hxx`); elastix's
   `AdvancedEuler3DTransform` computes its matrix the same way, and the
   demo's 3D run reports `ComputeZYX = 0`.

`buildFixedToMovingTransform` applies the first two to the list and the
third to each stage as it converts it, naming the stage from its class
before the rewrite, so the rigid stage is still written as `rigid`. The
ITK-format transform downloads are written from the original list, so an
`.h5` or `.tfm` still carries the Euler stage as ITK wrote it.

## What ngff-zarr does, so this app does not

For the record, so nobody reimplements it: `itkTransformToNgffTransform` folds
ITK's center of rotation into the offset (`b = t + c - A c`, since an RFC-5
affine has no center), permutes ITK's fastest-axis-first `x, y, z` component
order into Zarr `dims` order, and — given both images through its `frames`
argument — changes frame from ITK physical space, which includes the direction
matrix RFC-4 orientation implies, into the two intrinsic coordinate systems.
Passing both images is what makes the conversion exact for oriented data;
passing neither is correct only when neither image carries an orientation.
Passing the fixed image on both sides is what keeps the translation and
rigid stages in the fixed image's frame (see above).
