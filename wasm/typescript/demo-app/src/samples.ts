// Bundled sample image pairs served from public/samples/ (populated by
// scripts/fetch-samples.mjs, which .gitignore keeps out of the repository).
export interface Sample {
  id: string
  label: string
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
    id: 'ct-2d-head',
    label: '2D CT head',
    dimension: 2,
    fixed: resolveAssetUrl('samples/CT_2D_head_fixed.mha'),
    moving: resolveAssetUrl('samples/CT_2D_head_moving.mha'),
  },
  {
    id: 'mni-3d',
    label: '3D MNI T2w to T1w',
    dimension: 3,
    fixed: resolveAssetUrl('samples/tpl-MNI152NLin2009aSym_res-1_T2w.nii.gz'),
    moving: resolveAssetUrl('samples/tpl-MNI305_T1w.nii.gz'),
  },
]
