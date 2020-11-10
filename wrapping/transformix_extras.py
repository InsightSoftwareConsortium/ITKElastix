
import itk
import os

def transformix_deformation_field(*args, **kwargs):
    transformix_object = itk.TransformixFilter.New(*args, **kwargs)
    transformix_object.SetComputeDeformationField(True)
    transformix_object.UpdateLargestPossibleRegion()
    return transformix_object.GetOutputDeformationField()

def transformix_jacobian(*args, **kwargs):
    transformix_object = itk.TransformixFilter.New(*args, **kwargs)
    transformix_object.SetComputeSpatialJacobian(True)
    transformix_object.SetComputeDeterminantOfSpatialJacobian(True)
    transformix_object.UpdateLargestPossibleRegion()
    dir = kwargs.get('output_directory', None)
    if dir:
        det_spatial_jacobian = itk.imread(dir +'spatialJacobian.nii', itk.F)
        full_spatial_jacobian = itk.imread(dir +'fullSpatialJacobian.nii', itk.F)
    else:
        det_spatial_jacobian = itk.imread('spatialJacobian.nii', itk.F)
        full_spatial_jacobian = itk.imread('fullSpatialJacobian.nii', itk.F)
        os.remove('spatialJacobian.nii')
        os.remove('fullSpatialJacobian.nii')

    return (full_spatial_jacobian,det_spatial_jacobian)
