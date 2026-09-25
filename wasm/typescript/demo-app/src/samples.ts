// Bundled sample image pairs served from public/samples/ (populated by
// scripts/fetch-samples.mjs, which .gitignore keeps out of the repository):
// a zebrafish tailbud time-lapse from the OME-NGFF data resources, as one
// plane and as whole z-stacks, and two MNI brain templates.
export interface Sample {
  id: string
  label: string
  /** One line shown next to the sample button in the splash dialog. */
  description: string
  dimension: 2 | 3
  /** URL of the fixed image, already resolved against the app's base path. */
  fixed: string
  /** URL of the moving image, already resolved against the app's base path. */
  moving: string
}

/**
 * URL for a file under public/, honoring Vite's base path. Plain string
 * joining keeps this module importable where `document` does not exist;
 * `fetch` resolves the root-relative result against the page.
 */
export function resolveAssetUrl(path: string): string {
  const base: string = import.meta.env.BASE_URL
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`
}

export const samples: readonly Sample[] = [
  {
    id: 'zebrafish-tailbud-2d',
    label: '2D zebrafish tailbud',
    description:
      'One light-sheet plane of a zebrafish tailbud (H2B nuclei, IDR idr0051), 40 min apart as the tail extends; registers in about a second.',
    dimension: 2,
    fixed: resolveAssetUrl('samples/zebrafish-tailbud-z100_t00.ome.zarr'),
    moving: resolveAssetUrl('samples/zebrafish-tailbud-z100_t20.ome.zarr'),
  },
  {
    id: 'mni-3d',
    label: '3D MNI T2w to T1w',
    description: '3D MNI152 T2w template to MNI305 T1w template; a 3D registration takes longer.',
    dimension: 3,
    fixed: resolveAssetUrl('samples/tpl-MNI152NLin2009aSym_res-1_T2w.nii.gz'),
    moving: resolveAssetUrl('samples/tpl-MNI305_T1w.nii.gz'),
  },
  {
    id: 'zebrafish-tailbud-3d',
    label: '3D zebrafish tailbud',
    description:
      'The same tailbud as whole light-sheet z-stacks, 40 min apart; a 3D registration at full resolution takes longer.',
    dimension: 3,
    fixed: resolveAssetUrl('samples/zebrafish-tailbud_t00.ome.zarr'),
    moving: resolveAssetUrl('samples/zebrafish-tailbud_t20.ome.zarr'),
  },
]
