// @niivue/cbor-loader ships plain JavaScript (src/loader.js) with no type
// declarations. Only the exports this app uses are declared; confirm any
// addition against node_modules/@niivue/cbor-loader/src/loader.js.
declare module '@niivue/cbor-loader' {
  /** Decode an ITK-Wasm `.iwi.cbor` image and re-encode it as a NIfTI-1 file. */
  export function iwi2nii(buffer: ArrayBuffer | Uint8Array): Uint8Array
  /** Convert an already-decoded ITK-Wasm image object to NIfTI-1 bytes. */
  export function iwi2niiCore(iwi: unknown): Uint8Array
  /** Decode an ITK-Wasm `.iwm.cbor` mesh into positions and triangle indices. */
  export function iwm2mesh(buffer: ArrayBuffer | Uint8Array): {
    positions: Float32Array
    indices: Uint32Array
  }
}
