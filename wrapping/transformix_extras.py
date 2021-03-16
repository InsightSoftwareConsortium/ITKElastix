import numpy as np
import itk
import os

def transformix_deformation_field(*args, **kwargs):
    transformix_object = itk.TransformixFilter.New(*args, **kwargs)
    transformix_object.SetComputeDeformationField(True)
    transformix_object.UpdateLargestPossibleRegion()
    return transformix_object.GetOutputDeformationField()

# Satify itk package lazy loading
def transformix_deformation_field_init_docstring():
    pass

def transformix_jacobian(*args, **kwargs):
    transformix_object = itk.TransformixFilter.New(*args, **kwargs)
    transformix_object.SetComputeSpatialJacobian(True)
    transformix_object.SetComputeDeterminantOfSpatialJacobian(True)
    transformix_object.UpdateLargestPossibleRegion()
    output_dir = kwargs.get('output_directory', None)
    if output_dir:
        det_spatial_jacobian = itk.imread(output_dir +'spatialJacobian.nii', itk.F)
        full_spatial_jacobian = itk.imread(output_dir +'fullSpatialJacobian.nii', itk.F)
    else:
        det_spatial_jacobian = itk.imread('spatialJacobian.nii', itk.F)
        full_spatial_jacobian = itk.imread('fullSpatialJacobian.nii', itk.F)
        os.remove('spatialJacobian.nii')
        os.remove('fullSpatialJacobian.nii')

    return (full_spatial_jacobian,det_spatial_jacobian)

# Satify itk package lazy loading
def transformix_jacobian_init_docstring():
    pass

def transformix_pointset(*args, **kwargs):
    reduce_output = kwargs.get('reduce_output', False)
    if reduce_output:
        kwargs.pop('reduce_output')
    transformix_object = itk.TransformixFilter.New(*args, **kwargs)
    transformix_object.UpdateLargestPossibleRegion()
    output_dir = kwargs.get('output_directory', None)
    if output_dir:
        if output_dir[-1] != '/':
            output_dir += '/'
        moving_point_set = np.loadtxt(output_dir+'outputpoints.txt', dtype='str')
        if reduce_output:
            moving_point_set = moving_point_set[:,30:33].astype('float64')
    else:
        moving_point_set = np.loadtxt('outputpoints.txt', dtype='str')
        if reduce_output:
            moving_point_set = moving_point_set[:,30:33].astype('float64')
        os.remove('outputpoints.txt')
    return moving_point_set

# Satify itk package lazy loading
def transformix_pointset_init_docstring():
    pass

