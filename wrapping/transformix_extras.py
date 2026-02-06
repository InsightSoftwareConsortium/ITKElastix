import numpy as np
import itk
import os


def _convert_to_parameter_value(value):
    """Convert a single value to an elastix parameter string.

    Handles str, bool, int, and float types.  Note that bool must be
    checked before int because ``isinstance(True, int)`` is ``True``.
    """
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _convert_to_parameter_map(d):
    """Convert a dict to an elastix-compatible parameter map.

    The input dict may have values of type str, bool, int, float,
    or a list/tuple of those types (a "TOML dict").  The output is
    a dict mapping strings to tuples of strings, which is the format
    expected by the elastix ParameterMap (``std::map<std::string,
    std::vector<std::string>>``).
    """
    result = {}
    for key, value in d.items():
        if isinstance(value, (list, tuple)):
            result[key] = tuple(_convert_to_parameter_value(item) for item in value)
        else:
            result[key] = (_convert_to_parameter_value(value),)
    return result


def _dict_to_parameter_object(d):
    """Create a ParameterObject from a dict or list of dicts.

    If *d* is a single dict it is treated as one parameter map.
    If *d* is a list/tuple of dicts each element becomes a parameter map.
    If *d* is already a ParameterObject it is returned unchanged.
    """
    if hasattr(d, "GetNumberOfParameterMaps"):
        # Already a ParameterObject (or compatible)
        return d
    parameter_object = itk.ParameterObject.New()
    if isinstance(d, dict):
        parameter_object.SetParameterMap(_convert_to_parameter_map(d))
    elif isinstance(d, (list, tuple)):
        for i, item in enumerate(d):
            if isinstance(item, dict):
                item = _convert_to_parameter_map(item)
            if i == 0:
                parameter_object.SetParameterMap(item)
            else:
                parameter_object.AddParameterMap(item)
    return parameter_object


def _preprocess_parameter_args(args, kwargs, parameter_keys=None):
    """Convert dict-valued parameter arguments to ParameterObject instances.

    Inspects both positional *args* and keyword *kwargs*.  Any plain
    ``dict`` (or list of dicts) found at a position that would
    correspond to a parameter-object argument is automatically
    converted to a proper :class:`itk.ParameterObject`.
    """
    if parameter_keys is None:
        parameter_keys = ("parameter_object", "transform_parameter_object")

    new_args = list(args)
    for i, arg in enumerate(new_args):
        if isinstance(arg, dict):
            new_args[i] = _dict_to_parameter_object(arg)
        elif (
            isinstance(arg, (list, tuple)) and len(arg) > 0 and isinstance(arg[0], dict)
        ):
            new_args[i] = _dict_to_parameter_object(arg)

    for key in parameter_keys:
        if key in kwargs:
            val = kwargs[key]
            if isinstance(val, dict):
                kwargs[key] = _dict_to_parameter_object(val)
            elif (
                isinstance(val, (list, tuple))
                and len(val) > 0
                and isinstance(val[0], dict)
            ):
                kwargs[key] = _dict_to_parameter_object(val)

    return tuple(new_args), kwargs


def elastix_registration_method(*args, **kwargs):
    """Run elastix registration.

    Accepts the same arguments as the auto-generated
    ``itk.elastix_registration_method``, with the additional
    convenience that *parameter_object* may be a plain ``dict``
    (or a list of dicts) whose values are Python-native types
    (str, bool, int, float, or lists thereof).
    """
    args, kwargs = _preprocess_parameter_args(args, kwargs)
    registration_object = itk.ElastixRegistrationMethod.New(*args, **kwargs)
    registration_object.UpdateLargestPossibleRegion()
    return (
        registration_object.GetOutput(),
        registration_object.GetTransformParameterObject(),
    )


# Satisfy itk package lazy loading
def elastix_registration_method_init_docstring():
    pass


def transformix_filter(*args, **kwargs):
    """Run transformix.

    Accepts the same arguments as the auto-generated
    ``itk.transformix_filter``, with the additional
    convenience that *transform_parameter_object* may be a plain
    ``dict`` (or a list of dicts) whose values are Python-native types.
    """
    args, kwargs = _preprocess_parameter_args(args, kwargs)
    transformix_object = itk.TransformixFilter.New(*args, **kwargs)
    transformix_object.UpdateLargestPossibleRegion()
    return transformix_object.GetOutput()


# Satisfy itk package lazy loading
def transformix_filter_init_docstring():
    pass


def transformix_deformation_field(*args, **kwargs):
    args, kwargs = _preprocess_parameter_args(args, kwargs)
    transformix_object = itk.TransformixFilter.New(*args, **kwargs)
    transformix_object.SetComputeDeformationField(True)
    transformix_object.UpdateLargestPossibleRegion()
    return transformix_object.GetOutputDeformationField()


# Satisfy itk package lazy loading
def transformix_deformation_field_init_docstring():
    pass


def transformix_jacobian(*args, **kwargs):
    args, kwargs = _preprocess_parameter_args(args, kwargs)
    transformix_object = itk.TransformixFilter.New(*args, **kwargs)
    transformix_object.SetComputeSpatialJacobian(True)
    transformix_object.SetComputeDeterminantOfSpatialJacobian(True)
    transformix_object.UpdateLargestPossibleRegion()
    output_dir = kwargs.get("output_directory", None)
    if output_dir:
        det_spatial_jacobian = itk.imread(output_dir + "spatialJacobian.nii", itk.F)
        full_spatial_jacobian = itk.imread(
            output_dir + "fullSpatialJacobian.nii", itk.F
        )
    else:
        det_spatial_jacobian = itk.imread("spatialJacobian.nii", itk.F)
        full_spatial_jacobian = itk.imread("fullSpatialJacobian.nii", itk.F)
        os.remove("spatialJacobian.nii")
        os.remove("fullSpatialJacobian.nii")

    return (full_spatial_jacobian, det_spatial_jacobian)


# Satisfy itk package lazy loading
def transformix_jacobian_init_docstring():
    pass


def transformix_pointset(*args, **kwargs):
    reduce_output = kwargs.get("reduce_output", False)
    if reduce_output:
        kwargs.pop("reduce_output")
    args, kwargs = _preprocess_parameter_args(args, kwargs)
    transformix_object = itk.TransformixFilter.New(*args, **kwargs)
    transformix_object.UpdateLargestPossibleRegion()
    output_dir = kwargs.get("output_directory", None)
    if output_dir:
        if output_dir[-1] != "/":
            output_dir += "/"
        moving_point_set = np.loadtxt(output_dir + "outputpoints.txt", dtype="str")
        if reduce_output:
            moving_point_set = moving_point_set[:, 30:33].astype("float64")
    else:
        moving_point_set = np.loadtxt("outputpoints.txt", dtype="str")
        if reduce_output:
            moving_point_set = moving_point_set[:, 30:33].astype("float64")
        os.remove("outputpoints.txt")
    return moving_point_set


# Satisfy itk package lazy loading
def transformix_pointset_init_docstring():
    pass
