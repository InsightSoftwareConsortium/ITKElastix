
import itk

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
    det_spatial_jacobian = itk.imread('exampleoutput/spatialJacobian.nii', itk.F)
    full_spatial_jacobian = itk.imread('exampleoutput/fullSpatialJacobian.nii', itk.F)

    return (full_spatial_jacobian,det_spatial_jacobian)
