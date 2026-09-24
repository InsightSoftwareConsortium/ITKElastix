// niivue rendering panel. Display path: ITK-Wasm Image -> `.iwi.cbor` bytes
// (src/io/iwi-cbor.ts) -> File -> niivue, decoded by @niivue/cbor-loader's
// `iwi2nii`. niivue's native OME-Zarr loader is deliberately not used
// anywhere; every image reaches the viewer as an ITK-Wasm Image.
//
// A panel keeps the view choices made for it (the slice layout for 3D
// content and the colormap) and re-applies them whenever its volume is
// replaced, so the result switch swapping a panel's volume does not undo
// them. Every change to a panel's volume runs on the panel's own queue,
// one after another, so the shell and the view controls need not order
// their calls against each other. Panels joined with `linkPanels` navigate
// together through niivue's broadcast API: on every redraw the source
// panel copies its crosshair (through world millimetres, so different
// grids agree), 2D pan and zoom, 3D camera, and clip planes onto its
// peers, which redraw without broadcasting back. A panel also watches its
// container with a ResizeObserver and has niivue resize the canvas whenever
// the drawing buffer no longer matches the canvas's CSS box (the split
// panel flipping or being dragged, a comparison's box changing, the window
// changing), so the picture is never stretched. The four panels the demo
// mounts, two per comparison, are named in src/viewer/comparison-options.ts.
import type { Image } from 'itk-wasm'
import { NiiVue, SLICE_TYPE, type BackendType, type SyncOpts } from '@niivue/niivue'
import { iwi2nii } from '@niivue/cbor-loader'

import { imageToIwiCborBytes } from '../io/iwi-cbor'
import type { AppStore } from '../state'
import { canvasIsStale } from '../ui/layout-options'
import type { Notifier } from '../ui/notify'
import type { Splash } from '../ui/splash'
import {
  CROSSHAIR_WIDTH,
  DEFAULT_COLORMAP,
  DEFAULT_SLICE_TYPE,
  crosshairWidthForDimension,
  sliceTypeForDimension,
} from '../ui/view-options'
import { panelLabel, type DemoPanelRole } from './comparison-options'
import { promoteTo3d } from './promote-to-3d'

export { PANEL_ROLES, type DemoPanelRole } from './comparison-options'

/** File extension itk-wasm uses for CBOR-serialized images. */
export const IWI_CBOR_EXTENSION = 'iwi.cbor'
const IWI_CBOR_MIME_TYPE = 'application/cbor'

/**
 * What linked panels share. The slice layout is deliberately not synced:
 * the view controls set it on every panel, so a 2D panel (always axial)
 * never drags a 3D peer along.
 */
export const PANEL_SYNC_OPTIONS: SyncOpts = { '2d': true, '3d': true, crosshair: true, clipPlane: true }

export interface ResetViewOptions {
  /** Push the reset view onto the linked peers on the next frame. Default true. */
  broadcast?: boolean
}

/** niivue's scene defaults (what a fresh instance opens with), restored by `resetView`. */
const DEFAULT_VIEW = {
  crosshairPos: [0.5, 0.5, 0.5] as [number, number, number],
  pan2Dxyzmm: [0, 0, 0, 1] as [number, number, number, number],
  scaleMultiplier: 1,
  azimuth: 110,
  elevation: 10,
  renderPan: [0, 0] as [number, number],
}

/** Objects the Playwright specs read from `window.__demo`. */
export interface DemoGlobals {
  /** The NiiVue instance behind each panel, published as the panels are created. */
  panels?: Partial<Record<DemoPanelRole, NiiVue>>
  /** The application state store (see src/state.ts); published by main.ts. */
  state?: AppStore
  /** The splash dialog (see src/ui/splash.ts); published by main.ts. */
  splash?: Splash
  /** The notifier the toasts are raised through (see src/ui/notify.ts); published by main.ts. */
  notify?: Notifier
}

declare global {
  interface Window {
    __demo?: DemoGlobals
  }
}

/** Merge entries into `window.__demo`, creating it on first use. */
export function exposeDemoGlobals(globals: Partial<DemoGlobals>): DemoGlobals {
  const target = (window.__demo ??= {})
  Object.assign(target, globals)
  return target
}

/** Publish the NiiVue instance of the `role` panel as `window.__demo.panels[role]`. */
function exposeDemoPanel(role: DemoPanelRole, nv: NiiVue): void {
  const target = exposeDemoGlobals({})
  ;(target.panels ??= {})[role] = nv
}

export interface ViewerPanel {
  /** Which panel this is (see src/viewer/comparison-options.ts). */
  readonly role: DemoPanelRole
  /** Short name for messages (for example "Fixed (inputs)"). */
  readonly label: string
  readonly canvas: HTMLCanvasElement
  readonly nv: NiiVue
  /** Name of the volume currently displayed, or null when the panel is empty. */
  readonly currentName: string | null
  /** Spatial dimension of the displayed image, or null when the panel is empty. */
  readonly dimension: 2 | 3 | null
  /** The niivue `SLICE_TYPE` the panel is drawn in. */
  readonly sliceType: number
  /** The colormap the displayed image is drawn with (a name from `nv.colormaps`). */
  readonly colormap: string
  /** The panels this one broadcasts its navigation to. */
  readonly peers: readonly ViewerPanel[]
  /**
   * Display `image` under `name`, replacing whatever was shown before. 2D
   * images are promoted to single-slice 3D volumes for display only and
   * shown axially without a crosshair; 3D images are shown in the chosen
   * slice layout with one. The colormap is kept, and a linked peer's view
   * is adopted once the volume is in place.
   */
  show(image: Image, name: string): Promise<void>
  /** Remove every volume from the viewer. */
  clear(): Promise<void>
  /**
   * Choose the layout for 3D content (a `SLICE_TYPE` value) and apply it if
   * a 3D image is shown. 2D content stays axial. The choice outlives the
   * volume, so a swap keeps it.
   */
  setSliceType(sliceType: number): void
  /** Draw the displayed image, and every later one, with the colormap `name`. */
  setColormap(name: string): Promise<void>
  /**
   * Return the crosshair, 2D pan and zoom, and 3D camera to niivue's
   * defaults. The linked peers follow on the next frame unless `broadcast`
   * is false, which lets a peer's own reset win (see {@link resetLinkedViews}).
   */
  resetView(options?: ResetViewOptions): void
  /**
   * Broadcast this panel's navigation to `peers`; an empty list stops it.
   * Call on every panel (or use {@link linkPanels}) for a mutual link.
   */
  link(peers: readonly ViewerPanel[]): void
  /**
   * Have niivue match the drawing buffer to the canvas's CSS box if the
   * two disagree, and redraw. Runs on every container resize; returns
   * whether a resize was needed.
   */
  resize(): boolean
  /** Resolves once every volume change queued so far has finished. */
  settled(): Promise<void>
  /** Release GPU resources and detach the canvas. */
  destroy(): void
}

export interface ViewerPanelOptions {
  /**
   * Rendering backend. Defaults to WebGL2: it is available everywhere the
   * demo runs, including headless Chromium under SwiftShader, and skipping
   * niivue's WebGPU probe avoids a console error wherever no adapter exists.
   */
  backend?: BackendType
}

// `useLoader` writes into niivue's module-global reader table, so one
// registration covers every NiiVue instance on the page.
let iwiLoaderRegistered = false

function ensureIwiLoader(nv: NiiVue): void {
  if (iwiLoaderRegistered) {
    return
  }
  nv.useLoader(iwi2nii, IWI_CBOR_EXTENSION, 'nii')
  iwiLoaderRegistered = true
}

/** `<name>.iwi.cbor`, the file name niivue and itk-wasm both key their readers on. */
export function iwiCborFileName(name: string): string {
  return `${name}.${IWI_CBOR_EXTENSION}`
}

/**
 * Serialize an ITK-Wasm image to `.iwi.cbor` bytes wrapped in a `Blob`.
 * Encoding happens in JavaScript (see src/io/iwi-cbor.ts for why the
 * @itk-wasm/image-io writer is not used) on a fresh, non-shared buffer, which
 * `Blob` requires.
 */
export function imageToIwiCborBlob(image: Image): Blob {
  return new Blob([imageToIwiCborBytes(image)], { type: IWI_CBOR_MIME_TYPE })
}

/**
 * The `File` niivue loads `image` from, and the dimension it was. 2D images
 * are promoted to single-slice 3D volumes for display. niivue selects the
 * reader from the extension of the URL string itself (a bare blob: URL has
 * none), so the file's name ends in .iwi.cbor. No object URL is created,
 * so there is nothing to revoke.
 */
function displayFile(image: Image, name: string): { file: File; dimension: 2 | 3 } {
  const { dimension } = image.imageType
  if (dimension !== 2 && dimension !== 3) {
    throw new Error(`Cannot display a ${dimension}D image (${name})`)
  }
  const displayImage = dimension === 2 ? promoteTo3d(image) : image
  const blob = imageToIwiCborBlob(displayImage)
  return { file: new File([blob], iwiCborFileName(name), { type: IWI_CBOR_MIME_TYPE }), dimension }
}

/**
 * Create the niivue viewer of the `role` panel inside `container`, and
 * publish its NiiVue instance as `window.__demo.panels[role]`. The canvas
 * fills the container (see `.viewer-canvas` in style.css) and niivue tracks
 * its size with a ResizeObserver, so the container must have a definite
 * height.
 */
export async function createViewerPanel(
  container: HTMLElement,
  role: DemoPanelRole,
  options: ViewerPanelOptions = {},
): Promise<ViewerPanel> {
  const label = panelLabel(role)
  const canvas = document.createElement('canvas')
  canvas.className = 'viewer-canvas'
  canvas.setAttribute('aria-label', `${label} image`)
  canvas.dataset.role = role
  container.appendChild(canvas)

  const nv = new NiiVue({
    backend: options.backend ?? 'webgl2',
    backgroundColor: [0, 0, 0, 1],
    // The app owns file selection through the splash dialog.
    isDragDropEnabled: false,
    isOrientCubeVisible: false,
    isColorbarVisible: false,
    crosshairWidth: CROSSHAIR_WIDTH,
    sliceType: SLICE_TYPE.AXIAL,
  })
  await nv.attachToCanvas(canvas)
  ensureIwiLoader(nv)
  exposeDemoPanel(role, nv)

  let dimension: 2 | 3 | null = null
  let chosenSliceType = DEFAULT_SLICE_TYPE
  let colormap = DEFAULT_COLORMAP
  let peers: readonly ViewerPanel[] = []

  // Volume changes run one after another: niivue's loaders are asynchronous,
  // and the callers do not know about each other.
  let queue: Promise<void> = Promise.resolve()
  function enqueue(task: () => Promise<void>): Promise<void> {
    const run = queue.then(task)
    // A failed task rejects its caller's promise but must not stall the rest.
    queue = run.catch(() => undefined)
    return run
  }

  // `broadcastTo` replaces niivue's target list and clears its pending-sync
  // flag, so applying the link also discards any push a redraw queued
  // before it.
  function applyLink(): void {
    if (peers.length > 0) {
      nv.broadcastTo(
        peers.map((other) => other.nv),
        PANEL_SYNC_OPTIONS,
      )
    } else {
      nv.broadcastTo()
    }
  }

  const panel: ViewerPanel = {
    role,
    label,
    canvas,
    nv,
    get currentName() {
      return nv.volumes[0]?.name ?? null
    },
    get dimension() {
      return dimension
    },
    get sliceType() {
      return nv.sliceType
    },
    get colormap() {
      return colormap
    },
    get peers() {
      return peers
    },
    show(image, name) {
      return enqueue(async () => {
        const { file, dimension: imageDimension } = displayFile(image, name)
        // Stop broadcasting while the volume is replaced: a redraw niivue
        // queues mid-load would otherwise push this panel's half-updated scene
        // onto the peers.
        nv.broadcastTo()
        // Set before the load so a 2D image's first frame is already drawn without one.
        const crosshairWidth = crosshairWidthForDimension(imageDimension)
        if (nv.crosshairWidth !== crosshairWidth) {
          nv.crosshairWidth = crosshairWidth
        }
        // loadVolumes replaces the volume already shown. The scene (crosshair,
        // pan, camera) is left as it was.
        await nv.loadVolumes([{ url: file, name: file.name, colormap }])
        dimension = imageDimension
        const sliceType = sliceTypeForDimension(imageDimension, chosenSliceType)
        if (nv.sliceType !== sliceType) {
          nv.sliceType = sliceType
        }
        applyLink()
        // A peer's view wins after a swap: its next frame pushes the crosshair
        // (through world mm, so a result on the fixed grid lands where the
        // moving image's crosshair was), pan, zoom, and camera onto this panel.
        // The peers already agree with each other, so the first with content
        // speaks for all.
        peers.find((other) => other.currentName !== null)?.nv.drawScene()
      })
    },
    clear() {
      return enqueue(async () => {
        nv.broadcastTo()
        await nv.removeAllVolumes()
        dimension = null
        applyLink()
      })
    },
    setSliceType(sliceType) {
      chosenSliceType = sliceType
      if (dimension === 3 && nv.sliceType !== sliceType) {
        nv.sliceType = sliceType
      }
    },
    setColormap(name) {
      return enqueue(async () => {
        if (nv.volumes.length > 0) {
          await nv.setVolume(0, { colormap: name })
        }
        colormap = name
      })
    },
    resetView({ broadcast = true } = {}) {
      nv.crosshairPos = [...DEFAULT_VIEW.crosshairPos]
      nv.pan2Dxyzmm = [...DEFAULT_VIEW.pan2Dxyzmm]
      nv.scaleMultiplier = DEFAULT_VIEW.scaleMultiplier
      nv.azimuth = DEFAULT_VIEW.azimuth
      nv.elevation = DEFAULT_VIEW.elevation
      nv.renderPan = [...DEFAULT_VIEW.renderPan]
      // The setters have queued a redraw that would broadcast; re-applying
      // the link keeps the redraw but drops the broadcast.
      if (broadcast) {
        nv.drawScene()
      } else {
        applyLink()
      }
    },
    link(next) {
      peers = [...next]
      applyLink()
    },
    resize() {
      const box = canvas.getBoundingClientRect()
      if (!canvasIsStale({ width: canvas.width, height: canvas.height }, box, window.devicePixelRatio)) {
        return false
      }
      nv.resize()
      return true
    },
    settled() {
      return queue
    },
    destroy() {
      resizeObserver.disconnect()
      peers = []
      nv.broadcastTo()
      nv.destroy()
      canvas.remove()
    },
  }

  // niivue observes the canvas itself; observing the container as well
  // catches a box change the canvas observer has not delivered yet (the
  // two fire in the same batch, so this is usually a no-op) and keeps the
  // guarantee in the app's hands.
  const resizeObserver = new ResizeObserver(() => {
    panel.resize()
  })
  resizeObserver.observe(container)

  return panel
}

/** Link every panel to all the others so any one's navigation moves the rest; the returned function unlinks them. */
export function linkPanels(panels: readonly ViewerPanel[]): () => void {
  for (const panel of panels) {
    panel.link(panels.filter((other) => other !== panel))
  }
  return () => {
    for (const panel of panels) {
      panel.link([])
    }
  }
}

/**
 * Reset the view of linked panels so all end centred on `leader`'s image:
 * only the leader broadcasts its reset. Were every panel to broadcast, the
 * one whose frame happened to be scheduled first would win, and the shared
 * crosshair would land on whichever image it showed depending on load
 * timing.
 */
export function resetLinkedViews(leader: ViewerPanel, followers: readonly ViewerPanel[]): void {
  for (const follower of followers) {
    follower.resetView({ broadcast: false })
  }
  leader.resetView()
}
