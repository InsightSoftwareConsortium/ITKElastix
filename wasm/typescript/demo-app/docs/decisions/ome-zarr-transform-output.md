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
metadata, in two places: embedded in the registered image's own OZX, and as a
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

## Simplification is off

`itkTransformToNgffTransform` is called with `simplify: false`, so the result
is always an `affine` rather than the least expressive form that happens to
fit — `identity` for a registration that found nothing to do, `scale` or a
`sequence` of scale and translation for an axis-aligned one, `translation`
for a pure shift. Three reasons:

1. **One shape for consumers.** The transform is the demo's output; a reader
   that has to branch on four transformation types to find the matrix is
   worse off than one that always reads `affine`.
2. **The same object is written twice.** The embedded and standalone forms
   differ only in the name of their input system, so they must agree on
   type as well as numbers.
3. **`scale` cannot carry a mirror.** RFC-5 requires strictly positive scale
   factors, so a diagonal matrix with a negative entry — an ordinary result
   when the two images disagree about an axis direction — falls through to
   `affine` anyway. Making that the only case where the type changes would be
   the worst of both.

The matrix is the upper *M* x (*N*+1) block: the linear part with the
translation as its last column. For the 2D sample that is two rows of three
values.

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
            "type": "affine",
            "affine": [[1, 0, 0], [0, 1, 0]],
            "name": "fixed_to_moving",
            "input": { "name": "fixed" },
            "output": { "name": "moving" }
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
carry the elastix stages as they are, and only the OME-Zarr outputs hold the
single composed affine described here.

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

`buildFixedToMovingTransform` applies the three in that order. The ITK-format
transform downloads are written from the original list, so an `.h5` or
`.tfm` still carries the Euler stage as ITK wrote it.

## What ngff-zarr does, so this app does not

For the record, so nobody reimplements it: `itkTransformToNgffTransform` folds
ITK's center of rotation into the offset (`b = t + c - A c`, since an RFC-5
affine has no center), permutes ITK's fastest-axis-first `x, y, z` component
order into Zarr `dims` order, and — given both images through its `frames`
argument — changes frame from ITK physical space, which includes the direction
matrix RFC-4 orientation implies, into the two intrinsic coordinate systems.
Passing both images is what makes the conversion exact for oriented data;
passing neither is correct only when neither image carries an orientation.
