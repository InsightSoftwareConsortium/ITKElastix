# elastix affine registration demo

**Live:** <https://insightsoftwareconsortium.github.io/ITKElastix/>

A standalone browser application that registers a moving image onto a fixed
image with [elastix](https://elastix.dev/) through
[`@itk-wasm/elastix`](../README.md), renders the fixed, moving, and registered
images with [niivue](https://github.com/niivue/niivue), and reads and writes
[OME-Zarr](https://ngff.openmicroscopy.org/). Everything runs in the browser,
in WebAssembly and web workers; nothing is uploaded.

- **Inputs:** OME-Zarr (a directory store URL or a zipped `.ozx`), TIFF and
  OME-TIFF, and any format ITK reads (NIfTI, NRRD, MetaImage, DICOM, PNG, …),
  from a local file, a drag-and-drop, or a URL. Three sample pairs are
  bundled: a zebrafish tailbud light-sheet time-lapse from the
  [OME-NGFF data resources](https://ngff.openmicroscopy.org/resources/data/),
  as one 2D plane and as 3D z-stacks at two time points, and the 3D MNI152
  T2w and MNI305 T1w templates.
- **Registration:** elastix's translation → rigid → affine stage sequence with
  its default parameter maps, run in a web worker and cancellable. It starts
  as soon as a loaded pair is on screen; Register runs it again. The number
  of resolutions per stage and the pixel budget (below) are adjustable, and a
  summary card shows the fixed-to-moving matrix, the elapsed time, and a copy
  button for the elastix transform parameters as JSON.
- **Viewing:** two before/after comparisons, each a draggable divider between
  the fixed image on the left and another on the right: the moving image in
  the left-hand comparison, and in the right-hand one the registered result
  once a run has finished (a switch brings the moving image back for a
  before/after of its own). The two dividers move together. The four niivue
  panels behind them navigate together (crosshair, pan and zoom, and 3D
  camera; 2D images are drawn without the crosshair), with axial, coronal,
  sagittal, multiplanar, and 3D-render layouts for volumes (the render uses
  gradient opacity, so flat regions turn transparent and surfaces stay
  solid), a colormap for each side, and an "Image details" list under each
  comparison.
- **Outputs:** the registered image as OME-Zarr OZX (the default, with the
  transform embedded as an [RFC-5](https://ngff.openmicroscopy.org/rfc/5/)
  affine), OME-TIFF, or any of 17 ITK formats; the transform as a standalone
  RFC-5 OME-Zarr transform, an ITK transform file, or elastix's own
  TransformParameters JSON.
- Light and dark themes, a responsive layout that stacks the panels on a
  narrow window, and toast notifications for every outcome.

The design is described in
[`docs/architecture/architecture-overview.md`](docs/architecture/architecture-overview.md);
the OME-Zarr transform conventions in
[`docs/decisions/ome-zarr-transform-output.md`](docs/decisions/ome-zarr-transform-output.md).

## Development

The app needs Node 22 and pnpm 10 (the `packageManager` field of the root
`package.json` pins the exact pnpm). The repository's
[pixi](https://pixi.sh/) environment provides both, so every command below is
written as `pixi run -- pnpm …` from the **repository root**; with your own
Node and pnpm on `PATH`, drop the `pixi run --` prefix. The app is the
`itk-elastix-demo` workspace package (see the root `pnpm-workspace.yaml`),
which is why the commands use `--filter`.

```sh
pixi run -- pnpm install
pixi run -- pnpm --filter itk-elastix-demo dev
```

`dev` downloads the sample images (next section) and starts the Vite dev
server at <http://localhost:5188/> (the port is strict, so a second instance
fails rather than moving). The app depends on the published
`@itk-wasm/elastix@2.1.0` from the registry, not on the sibling workspace
package, so it needs neither the Emscripten toolchain nor a package build.

| Script          | What it does                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------- |
| `dev`           | Fetch the samples, then `vite --port 5188 --strictPort`.                                      |
| `build`         | Fetch the samples, `tsc --noEmit`, then `vite build` into `dist/`.                            |
| `preview`       | Serve `dist/` at <http://localhost:4174/> (strict port).                                      |
| `typecheck`     | `tsc --noEmit` over `src/`, `test/`, and the two config files.                                |
| `fetch-samples` | Download the sample images into `public/samples/`; `--strict` fails on a missing one.         |
| `test`          | The Playwright end-to-end suite (starts the dev server itself).                               |
| `test:unit`     | The `node:test` unit tests next to the DOM-free modules and scripts (`src/**/*.test.ts`, `scripts/**/*.test.mjs`). |

Useful while developing:

- `?budget=<MiB>` on the page URL (for example
  `http://localhost:5188/?budget=4`) shrinks the pixel budget so the ingest
  pipeline downsamples even the bundled samples; fractional values work.
- `window.__demo` exposes the state store (`state`), the four niivue instances
  (`panels`, keyed `inputs-fixed`, `inputs-moving`, `result-fixed`, and
  `result-moving`), the splash dialog (`splash`), and the notifier
  (`notify`), which is how the Playwright specs read the app.

### Sample images

`scripts/fetch-samples.mjs` writes six samples into `public/samples/`,
which `.gitignore` keeps out of the repository:

| Sample                                    | Pair                 | Source                                        |
| ----------------------------------------- | -------------------- | --------------------------------------------- |
| `zebrafish-tailbud-z100_t00.ome.zarr`     | 2D zebrafish tailbud | IDR idr0051 OME-Zarr 0.5, t = 0, z = 100      |
| `zebrafish-tailbud-z100_t20.ome.zarr`     | 2D zebrafish tailbud | IDR idr0051 OME-Zarr 0.5, t = 20, z = 100     |
| `zebrafish-tailbud_t00.ome.zarr`          | 3D zebrafish tailbud | IDR idr0051 OME-Zarr 0.5, t = 0               |
| `zebrafish-tailbud_t20.ome.zarr`          | 3D zebrafish tailbud | IDR idr0051 OME-Zarr 0.5, t = 20              |
| `tpl-MNI152NLin2009aSym_res-1_T2w.nii.gz` | 3D MNI T2w to T1w    | TemplateFlow's S3 bucket, then IPFS gateways  |
| `tpl-MNI305_T1w.nii.gz`                   | 3D MNI T2w to T1w    | TemplateFlow's S3 bucket, then IPFS gateways  |

The zebrafish pairs come from IDR study
[idr0051](https://idr.openmicroscopy.org/study/idr0051/) (Attardi et al.,
*Development* 2018, [doi:10.1242/dev.166728](https://doi.org/10.1242/dev.166728);
CC BY 4.0): light-sheet imaging of a zebrafish tailbud from the 18-somite
stage with H2B-labelled nuclei, one frame every 2 minutes, listed among the
[OME-NGFF data resources](https://ngff.openmicroscopy.org/resources/data/)
as an IDR OME-Zarr sample. Each pair is the time points 0 and 20, 40 minutes
apart, so the registration recovers how the tissue moved and extended in
between; the 2D pair is the plane IDR shows by default (z = 100). The
source is a 79-time-point OME-Zarr 0.5 store, so rather than download it the
script writes each sample as its own OME-Zarr store holding one time point
(`scripts/ome-zarr-select.mjs`): the encoded chunks are copied byte for byte,
since each fixed axis has chunk extent 1, and a plane comes out of its z-stack
shard through the shard index with HTTP range requests. Nothing is decoded,
the pyramid's levels and scales carry over, and a `derivedFrom` attribute
records the source URL and the time point and plane. A 3D stack is about
17 MB, a plane about 115 KB.

Existing non-empty files and stores are skipped, each download is tried with
one retry, and files and stores are written atomically (a store is renamed
into place once complete). Without `--strict` a failed download is only
logged, so the dev server still starts offline; `--strict` (what CI and the
Pages build pass) exits non-zero instead. `src/samples.ts` lists the pairs
the splash offers and resolves their URLs against the app's base path.

## Build

```sh
pixi run -- pnpm --filter itk-elastix-demo build
```

`dist/` is a fully self-hosted site: `index.html`, the hashed bundles under
`assets/` (including the itk-wasm pipeline worker and the ngff-zarr codec
worker), the sample images under `samples/`, and under `pipelines/` the
WebAssembly modules of `@itk-wasm/elastix`, `image-io`, `transform-io`, and
`downsample`, copied out of `node_modules` by `vite-plugin-static-copy`
(`vite.config.ts`). `src/pipelines.ts` points every ITK-Wasm package at
`<base>/pipelines/` before anything else runs, so the app never fetches a
module from a CDN.

To host the site under a sub-path, set `VITE_BASE_URL` for the build; Vite
reads it into `base`, and every asset, worker, pipeline, and sample URL is
derived from `import.meta.env.BASE_URL`:

```sh
VITE_BASE_URL=/ITKElastix/ pixi run -- pnpm --filter itk-elastix-demo build
VITE_BASE_URL=/ITKElastix/ pixi run -- pnpm --filter itk-elastix-demo preview
# now at http://localhost:4174/ITKElastix/
```

`preview` needs the same `VITE_BASE_URL` as the build, since `vite.config.ts`
reads it for both.

## Tests

### Unit tests

```sh
pixi run -- pnpm --filter itk-elastix-demo test:unit
```

Runs with Node's built-in test runner and `--experimental-strip-types`, so
the `*.test.ts` files import the modules under test directly. Those modules
are the DOM-free ones: the format registry, scale selection, normalization,
the OZX and TIFF stores, the transform-list clean-up, the RFC-5 builder, the
state store, the register, reload, and download flows (with their runner,
loader, and exporters injected), and the option modules behind each UI
control. The convention that makes this work: a module meant for the unit
tests imports its siblings with explicit `.ts` specifiers and never touches
the DOM or an ITK-Wasm pipeline package; the browser-only wiring next to it
(`load-image.ts`, `export-image.ts`, `register.ts`, the `ui/` bindings)
re-exports what it needs from there. The same runner covers
`scripts/ome-zarr-select.test.mjs`, the planner behind the one-time-point
OME-Zarr samples.

### End-to-end tests

The Playwright suite drives the app in Chromium. Install the browser once:

```sh
pixi run -- pnpm --filter itk-elastix-demo exec playwright install --with-deps chromium
```

Then:

```sh
pixi run -- pnpm --filter itk-elastix-demo test
```

Playwright starts the dev server itself (and reuses one already listening on
port 5188 outside CI). Headless Chromium has no GPU, so the only project
launches with SwiftShader flags to get the WebGL2 context niivue needs. The
specs, all under `test/`:

| Spec                    | Covers                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `smoke.spec.ts`         | Load the 2D tailbud pair, which registers on its own, toggle the result, download both outputs in their default OME-Zarr formats. |
| `inputs.spec.ts`        | The 3D NIfTI sample under the default and a forced budget, the 3D OME-Zarr sample, the URL fields, the file pickers, the pair check and swap. |
| `outputs.spec.ts`       | Every image and transform format, the RFC-5 metadata of the two OME-Zarr archives, OZX and OME-TIFF round trips. |
| `registration.spec.ts`  | The run each loaded or reloaded pair starts, the options pickers, the summary card, and cancelling a run. |
| `viewer.spec.ts`        | Linked navigation, colormaps, slice layouts, the comparison dividers and what each side shows.            |
| `layout.spec.ts`        | The narrow-window layout, the theme toggle, the footer links.                                             |
| `notify.spec.ts`        | Toasts for outcomes, above the splash, and the no-WebGL2 message.                                         |
| `register-3d.spec.ts`   | A full 3D registration of the MNI pair and its OME-Zarr downloads (marked slow, up to ten minutes).       |

To run one spec, call Playwright directly:

```sh
pixi run -- pnpm --filter itk-elastix-demo exec playwright test test/smoke.spec.ts
```

Three environment variables choose where the suite runs
(`playwright.config.ts`):

| Variable                | Effect                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `PLAYWRIGHT_WEB_SERVER` | A command Playwright starts and waits on, expected to serve `PLAYWRIGHT_BASE_URL` (or the dev server URL when that is unset). |
| `PLAYWRIGHT_BASE_URL`   | Alone: run against a server that is already up; nothing is started. A sub-path base URL works, since the specs navigate relatively. |
| `CI`                    | Start `vite` directly instead of `pnpm dev` (the workflow has already fetched the samples with `--strict`), forbid `test.only`, retry once, and write the HTML report. |

The recipe that checks a production build under the GitHub Pages sub-path:

```sh
VITE_BASE_URL=/ITKElastix/ pixi run -- pnpm --filter itk-elastix-demo build
VITE_BASE_URL=/ITKElastix/ PLAYWRIGHT_BASE_URL=http://localhost:4174/ITKElastix/ \
  PLAYWRIGHT_WEB_SERVER="pnpm preview" pixi run -- pnpm --filter itk-elastix-demo test
```

### In CI

`.github/workflows/wasm.yml` installs Chromium, builds the
`@itk-wasm/elastix` package with pixi, fetches the samples with `--strict`,
and runs `pixi run test-typescript`, which runs `pnpm test` in
`wasm/typescript`: the package's ava tests first, then
`pnpm --dir demo-app test`, this suite.

## Deployment

`.github/workflows/deploy-pages.yml` publishes the app to GitHub Pages at
<https://insightsoftwareconsortium.github.io/ITKElastix/>. It runs on every
push to `main`, on pull requests targeting `main` (build only), and on manual
dispatch. The `build` job checks out the repository, installs the workspace
with `pnpm install --frozen-lockfile`, fetches the samples with `--strict`,
builds with `VITE_BASE_URL=/ITKElastix/`, enables Pages if needed
(`actions/configure-pages` with `enablement: true`), and uploads
`wasm/typescript/demo-app/dist` as the Pages artifact; the `deploy` job, which
runs for `main` only, publishes it to the `github-pages` environment with
`actions/deploy-pages`. Because the app depends on the published
`@itk-wasm/elastix` from the lockfile, the job needs no Emscripten toolchain
and no pixi. Deploys are never cancelled mid-flight; queued runs wait.

If `configure-pages` fails on the very first run, set the Pages source to
"GitHub Actions" in the repository settings and re-run the workflow. Before
changing anything that touches URLs, run the sub-path recipe above: it is the
same build the workflow ships.

## Supported input formats

Sources are routed by extension (`src/io/source-kind.ts`) to one of four
readers, and every reader ends in the same tail, so the rest of the app sees
one kind of input:

| Source                       | Extensions                                  | From                          | Reader                                                                                                                 |
| ---------------------------- | ------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Zipped OME-Zarr (RFC-9)      | `.ozx`, `.ome.zarr.ozx`                     | file, drop, or URL            | Unzipped in memory and read with ngff-zarr; sharded arrays included.                                                   |
| OME-Zarr directory store     | `.ome.zarr`, `.zarr`                        | URL only                      | ngff-zarr over HTTP; only the metadata and the chunks of the chosen level are fetched.                                  |
| TIFF and OME-TIFF            | `.tif`, `.tiff`, `.ome.tif`, `.ome.tiff`    | file, drop, or URL            | [fiff](https://github.com/fideus-labs/fiff)'s `TiffStore`, read as an OME-Zarr 0.5 store; SubIFD pyramids are levels; a URL is read with range requests. |
| Anything ITK reads           | everything else                             | file, drop, or URL            | `@itk-wasm/image-io`'s `readImage`: NIfTI, NRRD, MetaImage, DICOM, HDF5, MINC, MGH, VTK, PNG, JPEG, BMP, and the rest. |

What every input becomes before elastix sees it (`src/io/normalize.ts`):

- **One time point and one channel.** An image with a `t` or `c` axis (an
  RGB PNG, a 4D NIfTI) is reduced to `t = 0`, `c = 0`; the counts are kept
  for the "Image details".
- **2D or 3D, scalar.** A volume that is one voxel thick along an axis is
  squeezed to 2D, so a single-slice NIfTI or a 2D OME-TIFF registers as 2D.
  Anything else than a scalar 2D or 3D image is refused with a message.
- **Both the same dimension.** The splash checks the pair and keeps its
  dialog open with the reason when a 2D image meets a 3D one.
- **Orientation.** A 3D image whose format stores a direction matrix (NIfTI,
  NRRD, MetaImage, MINC, MGH, DICOM, …) is tagged with RFC-4 anatomical
  orientations; OME-Zarr and OME-TIFF sources carry their own. That is what
  lets the RFC-5 transform be exact for oriented data.

Whichever the source, only the pyramid level the pixel budget selects is
decoded, so a large remote store is never downloaded whole.

## Output formats

Both download buttons have a format picker filled from the registry in
`src/io/formats.ts`. The registered image lives on the fixed image's grid.

**Registered image**

| Picker entry                  | File                     | Notes                                                                                                                                  |
| ----------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| OME-Zarr (default)            | `registered.ome.zarr.ozx` | An OME-Zarr 0.6 pyramid zipped as RFC-9, with the fixed-to-moving affine embedded as an RFC-5 transformation between the image's intrinsic and the moving coordinate systems. |
| OME-TIFF                      | `registered.ome.tif`     | Deflate-compressed, one plane per IFD, sub-resolution levels as SubIFDs; a volume's pyramid shrinks in x and y only.                     |
| NRRD, NIfTI, NIfTI compressed, MetaImage, VTK, HDF5, MGH, MINC, MRC, GIPL, BioRad PIC, Scanco AIM, Varian FDF, BMP, JPEG, PNG | `registered.<ext>` | Written by `@itk-wasm/image-io`. BMP and JPEG hold 2D 8-bit pixels only and PNG 2D unsigned 8- or 16-bit, so the 16-bit tailbud result as BMP or JPEG, a signed 16-bit slice as PNG, or a volume is refused with a message. |
| ITK-Wasm image                | `registered.iwi.cbor`    | Encoded in JavaScript so multi-byte pixels keep their byte order.                                                                       |

**Fixed-to-moving transform**

| Picker entry                       | File                        | Notes                                                                                                                           |
| ---------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| OME-Zarr transform (default)       | `transform.ome.zarr.ozx`    | A transform-only OME-Zarr 0.6 group holding the single RFC-5 affine from the `fixed` to the `moving` coordinate system, in a `scene`. |
| ITK HDF5 (`.h5`, `.hdf5`), ITK text (`.tfm`, `.txt`), MATLAB (`.mat`), ITK-Wasm transform (`.iwt.cbor`) | `transform.<ext>` | Written by `@itk-wasm/transform-io`, one entry per elastix stage (affine, rigid, translation; the last applied first).          |
| MINC XFM                           | `transform.xfm`             | Holds one 3D linear transform, so the three-stage list is refused up front with the reason.                                     |
| elastix TransformParameters (TOML) | `transform-parameters.zip`  | elastix's own parameter files in the TOML format, `TransformParameters.0.toml` to `.2.toml`, one per stage, written by `writeParameterFiles`. Each names the one before as its `InitialTransformParameterFileName`, so transformix given the last one applies every stage. |

The two OME-Zarr outputs carry the same affine; only the name of its input
coordinate system differs. Why the transform points from fixed to moving, why
it is always an `affine`, why it lives in a `scene`, and what has to be done
to elastix's transform list first are recorded in
[`docs/decisions/ome-zarr-transform-output.md`](docs/decisions/ome-zarr-transform-output.md).

## The 50 MB pixel budget

elastix runs single-threaded in WebAssembly, on a copy of each image's pixel
buffer, so the demo caps what it is handed. The **pixel budget** is the
largest uncompressed pixel buffer, in bytes, that either input may occupy
when it reaches elastix; the default is 50 MiB (`PIXEL_BUDGET_BYTES` in
`src/io/scale-select.ts`). The rule, applied to each input on its own:

1. Every input becomes an in-memory OME-Zarr multiscale pyramid. For a source
   that is not already a pyramid, isotropic spatial factors 2, 4, 8, … are
   added only until the estimated level size drops to or below the budget;
   an image that already fits gets a single level.
2. The **finest level that fits the budget** is the one converted to an ITK
   image and registered (and displayed). If no level fits, the coarsest is
   used. Only that level's chunks are decoded.
3. The budget is per image, so a 2D pair and a 3D pair are treated alike; the
   size actually handed to elastix, the level chosen, and the budget in
   effect are shown in the "Image details" under each panel.
4. The registered result lives on the fixed image's registration grid, so it
   fits the budget by construction and is exported at full resolution as a
   single-level pyramid (a smaller export budget would add levels, capped at
   four).

An input larger than 512 MiB at full resolution is warned about before the
downsampling starts, since building its pyramid takes a while and several
times its size in memory.

To change the budget: pass `?budget=<MiB>` on the page URL, or pick 10, 25,
50, or 100 MB in the "Registration options" panel, which reloads both inputs
from their files or URLs at the finest level that fits the new budget (and
drops any earlier result, as any new pair does) and registers the reloaded
pair. Raising it registers at a finer scale and takes longer; lowering it is
the way to register a pair that would otherwise be slow or run out of
memory. A run is already under way once a pair loads, so press Cancel first
to change the options for a slow pair.

## Project layout

```
demo-app/
├── index.html               The shell markup; every control has a stable id.
├── vite.config.ts           Base path, worker format, pipeline vendoring, dev/preview ports.
├── playwright.config.ts     Web server selection, SwiftShader Chromium project.
├── scripts/                 fetch-samples.mjs, and ome-zarr-select.mjs, which plans the
│                            one-time-point OME-Zarr samples (with its node:test tests).
├── public/                  logo.svg; samples/ is downloaded and ignored.
├── src/
│   ├── main.ts              Bootstrap: pipelines, WebAwesome, store, shell, flows.
│   ├── state.ts             The synchronous state store and its patches and selectors.
│   ├── samples.ts, pipelines.ts, format.ts
│   ├── io/                  Ingest (load-image, source-kind, scale-select, normalize,
│   │                        ozx-store, tiff-store) and export (formats, export-plan,
│   │                        export-image, export-transform, export, rfc5-transform,
│   │                        transform-list, iwi-cbor, download).
│   ├── registration/        registerAffine, its types, and cancellation.
│   ├── viewer/              niivue panels, the comparison layout, 2D-to-3D promotion, WebGL2 probe.
│   └── ui/                  Shell, splash, flows, panels, controls, theme, layout, toasts,
│                            each with a DOM-free *-options module beside it.
├── test/                    Playwright specs plus helpers.ts and ome-zarr.ts.
└── docs/
    ├── architecture/architecture-overview.md
    └── decisions/ome-zarr-transform-output.md
```

The package is private and excluded from the `@itk-wasm/elastix` npm
tarball (`../.npmignore`).
