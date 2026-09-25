// Display-only helper: lift a 2D ITK-Wasm image into a single-slice 3D image
// so niivue (via .iwi.cbor -> NIfTI) can render it. @niivue/cbor-loader's
// iwi2nii reads a 3x3 direction and three spacings, so a raw 2D image would
// produce a NaN affine. elastix must keep receiving the original 2D image;
// never feed the promoted copy back into registration or export.
//
// Keep this module free of DOM access so Node unit tests can import it.
import type { Image } from 'itk-wasm'

/**
 * Return a copy of a 2D image with a third dimension of size 1, spacing 1,
 * origin 0, and a 3x3 direction embedding the 2x2 one. The pixel buffer is
 * shared with the input: a single-slice volume has the identical layout.
 */
export function promoteTo3d(image: Image): Image {
  const { dimension } = image.imageType
  if (dimension !== 2) {
    throw new Error(`promoteTo3d expects a 2D image, got ${dimension}D`)
  }
  const source = image.direction
  if (source.length !== 4) {
    throw new Error(`promoteTo3d expects a 2x2 direction, got ${source.length} elements`)
  }
  // The same index formula is applied on both sides, so the embedding is
  // correct whether itk-wasm stores the flat matrix row- or column-major.
  const direction = new Float64Array(9)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      direction[row * 3 + col] = Number(source[row * 2 + col])
    }
  }
  direction[8] = 1

  return {
    imageType: { ...image.imageType, dimension: 3 },
    name: image.name,
    origin: [...image.origin, 0],
    spacing: [...image.spacing, 1],
    direction,
    size: [...image.size, 1],
    metadata: new Map(image.metadata),
    data: image.data,
  }
}
