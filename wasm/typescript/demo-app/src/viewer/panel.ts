// niivue rendering panel. Display path: ITK-Wasm Image -> `.iwi.cbor` bytes
// (src/io/iwi-cbor.ts) -> File -> niivue, decoded by @niivue/cbor-loader's
// `iwi2nii`. niivue's native OME-Zarr loader is deliberately not used
// anywhere; every image reaches the viewer as an ITK-Wasm Image.
import type { Image } from 'itk-wasm'
import { NiiVue, SLICE_TYPE, type BackendType } from '@niivue/niivue'
import { iwi2nii } from '@niivue/cbor-loader'

import { imageToIwiCborBytes } from '../io/iwi-cbor'
import { promoteTo3d } from './promote-to-3d'

/** File extension itk-wasm uses for CBOR-serialized images. */
export const IWI_CBOR_EXTENSION = 'iwi.cbor'
const IWI_CBOR_MIME_TYPE = 'application/cbor'

/** Which of the two registration inputs a panel displays. */
export type DemoPanelRole = 'fixed' | 'moving'

/** Objects the Playwright smoke test reads from `window.__demo`. */
export interface DemoGlobals {
  fixed?: NiiVue
  moving?: NiiVue
  /** Application state; populated by the shell once `src/state.ts` exists. */
  state?: unknown
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

export interface ViewerPanel {
  /** Caption shown to the user (for example "Fixed"). */
  readonly label: string
  readonly canvas: HTMLCanvasElement
  readonly nv: NiiVue
  /** Name of the volume currently displayed, or null when the panel is empty. */
  readonly currentName: string | null
  /**
   * Display `image` under `name`, replacing whatever was shown before. 2D
   * images are promoted to single-slice 3D volumes for display only and shown
   * axially; 3D images are shown in the multiplanar layout.
   */
  show(image: Image, name: string): Promise<void>
  /** Remove every volume from the viewer. */
  clear(): Promise<void>
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

  return {
    label,
    canvas,
    nv,
    get currentName() {
      return nv.volumes[0]?.name ?? null
    },
    async show(image, name) {
      const { dimension } = image.imageType
      if (dimension !== 2 && dimension !== 3) {
        throw new Error(`Cannot display a ${dimension}D image (${name})`)
      }
      const displayImage = dimension === 2 ? promoteTo3d(image) : image
      const blob = imageToIwiCborBlob(displayImage)
      const fileName = iwiCborFileName(name)
      // niivue selects the reader from the extension of the URL string itself
      // (a bare blob: URL has none), so hand it a File whose name ends in
      // .iwi.cbor. No object URL is created, so there is nothing to revoke.
      const file = new File([blob], fileName, { type: IWI_CBOR_MIME_TYPE })
      // loadVolumes replaces the volumes already shown.
      await nv.loadVolumes([{ url: file, name: fileName }])
      nv.sliceType = dimension === 2 ? SLICE_TYPE.AXIAL : SLICE_TYPE.MULTIPLANAR
    },
    async clear() {
      await nv.removeAllVolumes()
    },
    destroy() {
      nv.destroy()
      canvas.remove()
    },
  }
}
