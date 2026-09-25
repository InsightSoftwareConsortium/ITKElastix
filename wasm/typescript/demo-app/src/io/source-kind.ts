// Source-kind detection for the ingest router: decides from a file name (and
// the URL it came from, when there is one) which reader a source needs. Pure
// string functions, free of DOM access, so Node unit tests and workers can
// reuse them. Modeled on fidnii's `isTiffFilename` / `isOmeZarrUrl`
// (examples/convert/converter.ts).

/**
 * Reader a source is routed to:
 * - `ozx`: a zipped OME-Zarr store (`.ozx`, `.ome.zarr.ozx`), local or remote.
 * - `ome-zarr-url`: a remote OME-Zarr directory store (`.ome.zarr`, `.zarr`).
 * - `tiff`: TIFF or OME-TIFF (`.tif`, `.tiff`, `.ome.tif`, `.ome.tiff`).
 * - `itk`: everything else, read by `@itk-wasm/image-io`.
 */
export type SourceKind = 'ozx' | 'ome-zarr-url' | 'tiff' | 'itk'

/**
 * Format a source was read as, for display: the reader's name for `itk`
 * and the container format otherwise. Finer than {@link SourceKind}: the
 * `tiff` head tells an OME-TIFF from a plain TIFF once it has seen whether
 * the file carries OME-XML.
 */
export type SourceFormat = 'ITK' | 'OME-Zarr' | 'OZX' | 'TIFF' | 'OME-TIFF'

/** Format label of each source kind before the file is opened. */
export const SOURCE_KIND_FORMATS: Readonly<Record<SourceKind, SourceFormat>> = {
  itk: 'ITK',
  ozx: 'OZX',
  'ome-zarr-url': 'OME-Zarr',
  tiff: 'TIFF',
}

/**
 * Format label of a source kind: 'ITK', 'OZX', 'OME-Zarr', or 'TIFF'. The
 * `tiff` head refines 'TIFF' to 'OME-TIFF' after opening the file.
 */
export function sourceFormatForKind(kind: SourceKind): SourceFormat {
  return SOURCE_KIND_FORMATS[kind]
}

/** Extensions of zipped OME-Zarr stores; `.ome.zarr.ozx` ends with `.ozx`. */
export const OZX_EXTENSIONS: readonly string[] = ['.ozx']

/** Extensions of OME-Zarr directory stores; `.ome.zarr` ends with `.zarr`. */
export const OME_ZARR_EXTENSIONS: readonly string[] = ['.zarr']

/** TIFF extensions, OME-TIFF included; matching is by suffix. */
export const TIFF_EXTENSIONS: readonly string[] = ['.ome.tif', '.ome.tiff', '.tif', '.tiff']

function hasExtension(lowerPath: string, extensions: readonly string[]): boolean {
  return extensions.some((extension) => lowerPath.endsWith(extension))
}

/**
 * Path of `url` without query, fragment, or trailing slashes, still
 * percent-encoded. Relative URLs (the bundled samples are root-relative)
 * resolve against a placeholder origin; anything `URL` still rejects is
 * trimmed by hand.
 */
function trimmedPath(url: string): string {
  let path: string
  try {
    path = new URL(url, 'http://localhost/').pathname
  } catch {
    path = url.split(/[?#]/, 1)[0]
  }
  return path.replace(/\/+$/, '')
}

/** Lower-cased {@link trimmedPath}, for extension checks. */
export function urlPathname(url: string): string {
  return trimmedPath(url).toLowerCase()
}

/**
 * File name portion of a URL: the last path segment, without query,
 * fragment, or trailing slash (so a directory store URL keeps its
 * `.ome.zarr` name). Percent-escapes are decoded when well formed.
 */
export function nameFromUrl(url: string): string {
  const path = trimmedPath(url)
  const encoded = path.slice(path.lastIndexOf('/') + 1)
  let name: string
  try {
    name = decodeURIComponent(encoded)
  } catch {
    name = encoded
  }
  return name || 'image'
}

/** Whether `name` (or a URL path) carries a TIFF or OME-TIFF extension. */
export function isTiffFilename(name: string): boolean {
  return hasExtension(name.toLowerCase(), TIFF_EXTENSIONS)
}

/** Whether `name` (or a URL path) carries a zipped OME-Zarr extension. */
export function isOzxFilename(name: string): boolean {
  return hasExtension(name.toLowerCase(), OZX_EXTENSIONS)
}

/** Whether the URL path names an OME-Zarr directory store (`.ome.zarr`, `.zarr`). */
export function isOmeZarrUrl(url: string): boolean {
  return hasExtension(urlPathname(url), OME_ZARR_EXTENSIONS)
}

/**
 * Extensions of formats whose headers carry a direction matrix, so the
 * anatomical orientation metadata (RFC 4) derived from it can be trusted.
 * Compound extensions must be listed alongside their bare forms because
 * matching is by suffix. fidnii's list (examples/convert/converter.ts).
 */
export const ORIENTATION_EXTENSIONS: readonly string[] = [
  '.nii',
  '.nii.gz',
  '.nrrd',
  '.nhdr',
  '.mha',
  '.mhd',
  '.mnc',
  '.mnc.gz',
  '.gipl',
  '.gipl.gz',
  '.hdf5',
  '.h5',
  '.fdf',
  '.mgh',
  '.mgz',
  '.img',
  '.img.gz',
  '.hdr',
  '.hdr.gz',
  '.dcm',
  '.dicom',
]

/**
 * Whether the file name suggests a format that stores anatomical
 * orientation. DICOM slices are often stored without an extension or with a
 * numeric one, so those count too. Ingest applies this to a 3D input before
 * `itkImageToNgffImage`, and the exporter applies it to the fixed input to
 * decide the same for the registered image on its grid.
 */
export function hasOrientationExtension(name: string): boolean {
  const lower = name.toLowerCase()
  const base = lower.slice(lower.lastIndexOf('/') + 1)
  if (hasExtension(base, ORIENTATION_EXTENSIONS)) {
    return true
  }
  return !base.includes('.') || /\.\d+$/.test(base)
}

/**
 * Route a source by extension. `name` is the file name (a `File.name` or
 * the name derived from a URL); `url` is the URL it is fetched from, when
 * there is one. OZX and TIFF are recognised from either; a directory store
 * can only be a URL, so `.zarr` is checked on the URL path when a URL is
 * given and on the name otherwise. Anything else is left to ITK-Wasm.
 */
export function detectSourceKind(name: string, url?: string): SourceKind {
  const lowerName = name.toLowerCase()
  const path = url === undefined ? lowerName : urlPathname(url)
  if (isOzxFilename(lowerName) || isOzxFilename(path)) {
    return 'ozx'
  }
  if (isTiffFilename(lowerName) || isTiffFilename(path)) {
    return 'tiff'
  }
  if (hasExtension(path, OME_ZARR_EXTENSIONS)) {
    return 'ome-zarr-url'
  }
  return 'itk'
}
