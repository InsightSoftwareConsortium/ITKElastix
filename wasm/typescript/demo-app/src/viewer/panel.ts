// niivue rendering panel. Display path: ITK-Wasm Image -> `.iwi.cbor` bytes
// (src/io/iwi-cbor.ts) -> File -> niivue, decoded by @niivue/cbor-loader's
// `iwi2nii`. niivue's native OME-Zarr loader is deliberately not used
// anywhere; every image reaches the viewer as an ITK-Wasm Image.
//
// A panel keeps the view choices made for it (the slice layout for 3D
// content and the colormap) and re-applies them whenever its volume is
// replaced, so the result toggle swapping the moving panel's volume does
// not undo them. It can also blend a second image over its base volume
// (overlay mode, src/viewer/overlay.ts); the overlay is content rather than
// a view choice, so replacing the base drops it and the owner adds it back
// from the state. Every change to a panel's volumes runs on the panel's own
// queue, one after another, so the shell, the overlay, and the view
// controls need not order their calls against each other. Two panels joined
// with `linkPanels` navigate together through niivue's broadcast API: on
// every redraw the source panel copies its crosshair (through world
// millimetres, so different grids agree), 2D pan and zoom, 3D camera, and
// clip planes onto its peer. A panel also watches its container with a
// ResizeObserver and has niivue resize the canvas whenever the drawing
// buffer no longer matches the canvas's CSS box (the split panel flipping
// or being dragged, the window changing), so the picture is never
// stretched.
import type { Image } from 'itk-wasm'
import { NiiVue, SLICE_TYPE, type BackendType, type NVImage, type SyncOpts } from '@niivue/niivue'
import { iwi2nii } from '@niivue/cbor-loader'

import { imageToIwiCborBytes } from '../io/iwi-cbor'
import type { AppStore } from '../state'
import { canvasIsStale } from '../ui/layout-options'
import type { Notifier } from '../ui/notify'
import type { Splash } from '../ui/splash'
import { DEFAULT_COLORMAP, DEFAULT_SLICE_TYPE, sliceTypeForDimension } from '../ui/view-options'
import { promoteTo3d } from './promote-to-3d'

/** File extension itk-wasm uses for CBOR-serialized images. */
export const IWI_CBOR_EXTENSION = 'iwi.cbor'
const IWI_CBOR_MIME_TYPE = 'application/cbor'

/** Which of the two registration inputs a panel displays. */
export type DemoPanelRole = 'fixed' | 'moving'

/** Both panel roles, in layout order. */
export const PANEL_ROLES: readonly DemoPanelRole[] = ['fixed', 'moving']

/**
 * What linked panels share. The slice layout is deliberately not synced:
 * the view controls set it on both panels, so a 2D panel (always axial)
 * never drags a 3D peer along.
 */
export const PANEL_SYNC_OPTIONS: SyncOpts = { '2d': true, '3d': true, crosshair: true, clipPlane: true }

export interface ResetViewOptions {
  /** Push the reset view onto the linked peer on the next frame. Default true. */
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

/** Objects the Playwright smoke test reads from `window.__demo`. */
export interface DemoGlobals {
  fixed?: NiiVue
  moving?: NiiVue
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

/** A second image blended over a panel's base volume. */
export interface OverlayContent {
  image: Image
  name: string
  /** A name from `nv.colormaps`. */
  colormap: string
  /** 0 (invisible) to 1 (opaque). */
  opacity: number
}

export interface ViewerPanel {
  /** Caption shown to the user (for example "Fixed"). */
  readonly label: string
  readonly canvas: HTMLCanvasElement
  readonly nv: NiiVue
  /** Name of the volume currently displayed, or null when the panel is empty. */
  readonly currentName: string | null
  /** Name of the volume blended over the base, or null when there is none. */
  readonly overlayName: string | null
  /** Spatial dimension of the displayed image, or null when the panel is empty. */
  readonly dimension: 2 | 3 | null
  /** The niivue `SLICE_TYPE` the panel is drawn in. */
  readonly sliceType: number
  /** The colormap the displayed image is drawn with (a name from `nv.colormaps`). */
  readonly colormap: string
  /** The panel this one broadcasts its navigation to, or null. */
  readonly peer: ViewerPanel | null
  /**
   * Display `image` under `name`, replacing whatever was shown before, the
   * overlay included. 2D images are promoted to single-slice 3D volumes
   * for display only and shown axially; 3D images are shown in the chosen
   * slice layout. The colormap is kept, and a linked peer's view is adopted
   * once the volume is in place.
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
   * Blend `overlay.image` over the base volume in its colormap at its
   * opacity, replacing any earlier overlay; null removes it. The same image
   * under the same name only has its colormap and opacity brought up to
   * date. niivue reslices the overlay onto the base's grid through world
   * coordinates, so an image on its own grid lands where it belongs, and
   * the crosshair keeps its world position while the scene extents grow or
   * shrink to fit both volumes. Rejects without a base to overlay on.
   */
  setOverlay(overlay: OverlayContent | null): Promise<void>
  /**
   * Return the crosshair, 2D pan and zoom, and 3D camera to niivue's
   * defaults. A linked peer follows on the next frame unless `broadcast` is
   * false, which lets the peer's own reset win (see {@link resetLinkedViews}).
   */
  resetView(options?: ResetViewOptions): void
  /**
   * Broadcast this panel's navigation to `peer`; null stops it. Call on both
   * panels (or use {@link linkPanels}) for a two-way link.
   */
  link(peer: ViewerPanel | null): void
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
  /** When set, the NiiVue instance is published as `window.__demo[role]`. */
  role?: DemoPanelRole
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
 * Create a niivue viewer inside `container`. The canvas fills the container
 * (see `.viewer-canvas` in style.css) and niivue tracks its size with a
 * ResizeObserver, so the container must have a definite height.
 */
export async function createViewerPanel(
  container: HTMLElement,
  label: string,
  options: ViewerPanelOptions = {},
): Promise<ViewerPanel> {
  const canvas = document.createElement('canvas')
  canvas.className = 'viewer-canvas'
  canvas.setAttribute('aria-label', `${label} image`)
  if (options.role) {
    canvas.dataset.role = options.role
  }
  container.appendChild(canvas)

  const nv = new NiiVue({
    backend: options.backend ?? 'webgl2',
    backgroundColor: [0, 0, 0, 1],
    // The app owns file selection through the splash dialog.
    isDragDropEnabled: false,
    isOrientCubeVisible: false,
    isColorbarVisible: false,
    crosshairWidth: 1,
    sliceType: SLICE_TYPE.AXIAL,
  })
  await nv.attachToCanvas(canvas)
  ensureIwiLoader(nv)
  if (options.role) {
    exposeDemoGlobals({ [options.role]: nv })
  }

  let dimension: 2 | 3 | null = null
  let chosenSliceType = DEFAULT_SLICE_TYPE
  let colormap = DEFAULT_COLORMAP
  let peer: ViewerPanel | null = null
  /** The overlay in place and the niivue volume that carries it. */
  let overlay: { content: OverlayContent; volume: NVImage } | null = null

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
    if (peer) {
      nv.broadcastTo(peer.nv, PANEL_SYNC_OPTIONS)
    } else {
      nv.broadcastTo()
    }
  }

  function sameOverlay(current: OverlayContent, next: OverlayContent): boolean {
    return current.image === next.image && current.name === next.name
  }

  const panel: ViewerPanel = {
    label,
    canvas,
    nv,
    get currentName() {
      return nv.volumes[0]?.name ?? null
    },
    get overlayName() {
      return overlay?.volume.name ?? null
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
    get peer() {
      return peer
    },
    show(image, name) {
      return enqueue(async () => {
        const { file, dimension: imageDimension } = displayFile(image, name)
        // Stop broadcasting while the volume is replaced: a redraw niivue
        // queues mid-load would otherwise push this panel's half-updated scene
        // onto the peer.
        nv.broadcastTo()
        // loadVolumes replaces the volumes already shown, the overlay among
        // them. The scene (crosshair, pan, camera) is left as it was.
        await nv.loadVolumes([{ url: file, name: file.name, colormap }])
        overlay = null
        dimension = imageDimension
        const sliceType = sliceTypeForDimension(imageDimension, chosenSliceType)
        if (nv.sliceType !== sliceType) {
          nv.sliceType = sliceType
        }
        applyLink()
        // The peer's view wins after a swap: its next frame pushes the crosshair
        // (through world mm, so a result on the fixed grid lands where the
        // moving image's crosshair was), pan, zoom, and camera onto this panel.
        if (peer && peer.currentName !== null) {
          peer.nv.drawScene()
        }
      })
    },
    clear() {
      return enqueue(async () => {
        nv.broadcastTo()
        await nv.removeAllVolumes()
        overlay = null
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
    setOverlay(next) {
      return enqueue(async () => {
        if (overlay && next && sameOverlay(overlay.content, next)) {
          const changes: { colormap?: string; opacity?: number } = {}
          if (overlay.content.colormap !== next.colormap) {
            changes.colormap = next.colormap
          }
          if (overlay.content.opacity !== next.opacity) {
            changes.opacity = next.opacity
          }
          if (Object.keys(changes).length > 0) {
            await nv.setVolume(nv.volumes.indexOf(overlay.volume), changes)
          }
          overlay = { content: next, volume: overlay.volume }
          return
        }
        if (!overlay && !next) {
          return
        }
        // The scene extents niivue frames the view in span every volume, so
        // the crosshair, a fraction of them, would drift in world mm when
        // the overlay's grid differs from the base's. Carry it across in mm,
        // and keep the intermediate draws from pushing the drift onto the
        // peer.
        const crosshairMm = nv.model.scene2mm(nv.crosshairPos)
        nv.broadcastTo()
        try {
          if (overlay) {
            const index = nv.volumes.indexOf(overlay.volume)
            overlay = null
            if (index > 0) {
              await nv.removeVolume(index)
            }
          }
          if (next) {
            if (nv.volumes.length === 0) {
              throw new Error(`No image to overlay ${next.name} on`)
            }
            const { file } = displayFile(next.image, next.name)
            await nv.addVolume({ url: file, name: file.name, colormap: next.colormap, opacity: next.opacity })
            overlay = { content: next, volume: nv.volumes[nv.volumes.length - 1]! }
          }
        } finally {
          const restored = nv.model.mm2scene(crosshairMm)
          nv.crosshairPos = [0, 1, 2].map((axis) => Math.min(1, Math.max(0, restored[axis]!))) as [
            number,
            number,
            number,
          ]
          // Re-linking drops the pushes the draws above queued; the redraw
          // then broadcasts the restored position.
          applyLink()
          nv.drawScene()
        }
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
      peer = next
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
      peer = null
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

/** Link two panels both ways so either one's navigation moves the other; the returned function unlinks them. */
export function linkPanels(a: ViewerPanel, b: ViewerPanel): () => void {
  a.link(b)
  b.link(a)
  return () => {
    a.link(null)
    b.link(null)
  }
}

/**
 * Reset the view of two linked panels so both end centred on `leader`'s
 * image: only the leader broadcasts its reset. Were both to broadcast, the
 * one whose frame happened to be scheduled first would win, and the shared
 * crosshair would land on either image depending on load timing.
 */
export function resetLinkedViews(leader: ViewerPanel, follower: ViewerPanel): void {
  follower.resetView({ broadcast: false })
  leader.resetView()
}
