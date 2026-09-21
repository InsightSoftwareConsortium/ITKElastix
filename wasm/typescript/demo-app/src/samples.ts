export interface Sample {
  id: string;
  label: string;
  dimension: 2 | 3;
  fixed: string;
  moving: string;
}

const basePath = import.meta.env.BASE_URL;

export const samples: Sample[] = [
  {
    id: 'ct-2d-head',
    label: '2D CT head',
    dimension: 2,
    fixed: new URL('samples/CT_2D_head_fixed.mha', basePath).href,
    moving: new URL('samples/CT_2D_head_moving.mha', basePath).href,
  },
  {
    id: 'mni-3d',
    label: '3D MNI T2w to T1w',
    dimension: 3,
    fixed: new URL('samples/tpl-MNI152NLin2009aSym_res-1_T2w.nii.gz', basePath).href,
    moving: new URL('samples/tpl-MNI305_T1w.nii.gz', basePath).href,
  },
];
