// Byte-buffer helpers shared by the viewer and the download code.
// Keep this module free of DOM access so Node unit tests can import it.

/**
 * Copy a typed-array view (or a raw buffer) into a fresh `Uint8Array` backed
 * by a plain, non-shared `ArrayBuffer` of exactly `byteLength` bytes.
 *
 * ITK-Wasm pipelines can hand back views onto a `SharedArrayBuffer`, which
 * `Blob` and `File` reject, or views onto a larger buffer, whose surrounding
 * bytes would otherwise leak into the output.
 */
export function toPlainUint8Array(source: ArrayBufferView | ArrayBufferLike): Uint8Array<ArrayBuffer> {
  const view = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source)
  const copy = new Uint8Array(view.byteLength)
  copy.set(view)
  return copy
}
