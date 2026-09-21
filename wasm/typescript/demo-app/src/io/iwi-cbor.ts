// Serialize an ITK-Wasm Image to `.iwi.cbor` bytes in JavaScript.
//
// Why not `writeImage(image, 'x.iwi.cbor')` from @itk-wasm/image-io? Its
// writer (itk-wasm 1.0.0-b.201 / image-io 1.6.1) tags 16-, 32- and 64-bit
// pixel buffers with the RFC 8746 *big-endian* typed-array tags (73 for
// int16) while storing little-endian bytes. cbor-x, which both
// @niivue/cbor-loader and niivue use to decode, honors the tag and
// byte-swaps every voxel, so an int16 CT arrives multiplied by 256 and
// wrapped. cbor-x's own encoder writes the matching little-endian tags
// (77 for int16), so encoding here round-trips exactly, and the output is
// still a spec-conformant IWI file that itk-wasm's readers accept.
//
// Keep this module free of DOM access so Node unit tests can import it.
import type { Image } from 'itk-wasm'
import { Encoder } from 'cbor-x'

import { toPlainUint8Array } from './bytes.ts'

// Plain CBOR maps (no cbor-x record structures) so any CBOR reader can
// decode the result, not only cbor-x.
const iwiEncoder = new Encoder({ useRecords: false })

/** The IWI document layout itk-wasm writes: same keys, same value kinds. */
export interface IwiDocument {
  imageType: Image['imageType']
  name: string
  origin: number[]
  spacing: number[]
  direction: Image['direction']
  size: number[]
  metadata: Image['metadata']
  data: NonNullable<Image['data']>
}

/** Build the plain object that becomes the CBOR map. */
export function imageToIwiDocument(image: Image): IwiDocument {
  if (image.data === null) {
    throw new Error(`Image ${image.name || '(unnamed)'} has no pixel data to serialize`)
  }
  return {
    imageType: { ...image.imageType },
    name: image.name,
    origin: [...image.origin],
    spacing: [...image.spacing],
    direction: image.direction,
    size: [...image.size],
    metadata: image.metadata,
    data: image.data,
  }
}

/**
 * Encode an image as `.iwi.cbor` bytes on a fresh, non-shared buffer.
 * Pixel data is written with the typed-array tag matching its byte order.
 */
export function imageToIwiCborBytes(image: Image): Uint8Array<ArrayBuffer> {
  return toPlainUint8Array(iwiEncoder.encode(imageToIwiDocument(image)))
}
