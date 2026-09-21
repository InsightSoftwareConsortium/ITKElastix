// Save in-memory bytes through the browser's download mechanism: a Blob, an
// object URL, and a click on a temporary anchor with a `download` name. The
// document is injectable so the node unit tests can drive it with a fake.
import { toPlainUint8Array } from './bytes.ts'

/** Signature of {@link downloadBytes}, for injecting a stand-in. */
export type DownloadFunction = (bytes: Uint8Array, filename: string) => void

export interface DownloadOptions {
  /** Document to create the anchor in; the page's own by default. */
  document?: Document
}

/**
 * Download `bytes` as a file named `filename`. The bytes are copied onto a
 * plain `ArrayBuffer` first because `Blob` rejects `SharedArrayBuffer`-backed
 * views, which ITK-Wasm pipelines can hand back. The object URL is revoked
 * once the click has been dispatched.
 */
export function downloadBytes(bytes: Uint8Array, filename: string, { document: doc = document }: DownloadOptions = {}): void {
  const blob = new Blob([toPlainUint8Array(bytes)], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const anchor = doc.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  // Firefox only honours `download` on anchors that are in the document.
  doc.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    URL.revokeObjectURL(url)
  }
}
