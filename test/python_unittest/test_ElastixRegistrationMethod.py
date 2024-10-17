"""Module providing Python unit tests for itk.ElastixRegistrationMethod."""

import unittest
import itk


class ElastixRegistrationMethodTestCase(unittest.TestCase):
    """Tests itk.ElastixRegistrationMethod"""

    def test_SimilarityTransform(self) -> None:
        """Tests SimilarityTransform"""

        def set_pixels_of_object(image, index_value: int, size_value: int) -> None:
            for i in range(index_value, index_value + size_value):
                for j in range(index_value, index_value + size_value):
                    image.SetPixel([i, j], 1)

        dimension = 2
        ImageType = itk.Image[itk.F, dimension]
        SizeType = itk.Size[dimension]

        fixed_object_size_value = 32
        fixed_object_index_value = fixed_object_size_value
        fixed_image_size_value = 4 * fixed_object_size_value

        moving_object_size_value = 40
        moving_object_index_value = moving_object_size_value
        moving_image_size_value = 4 * moving_object_size_value

        fixed_image = ImageType.New(Regions=SizeType.Filled(fixed_image_size_value))
        fixed_image.AllocateInitialized()
        set_pixels_of_object(
            fixed_image, fixed_object_index_value, fixed_object_size_value
        )

        moving_image = ImageType.New(Regions=SizeType.Filled(moving_image_size_value))
        moving_image.AllocateInitialized()
        set_pixels_of_object(
            moving_image, moving_object_index_value, moving_object_size_value
        )

        parameter_map = {
            "ImageSampler": ("Full",),
            "MaximumNumberOfIterations": ("50",),
            "Metric": ("AdvancedNormalizedCorrelation",),
            "Optimizer": ("AdaptiveStochasticGradientDescent",),
            "Transform": ("SimilarityTransform",),
        }
        registration = itk.ElastixRegistrationMethod[ImageType, ImageType].New(
            FixedImage=fixed_image,
            MovingImage=moving_image,
            ParameterObject=itk.ParameterObject.New(ParameterMap=parameter_map),
        )
        registration.Update()
        transform_parameter_object = registration.GetTransformParameterObject()
        transform_parameters = transform_parameter_object.GetParameter(
            0, "TransformParameters"
        )
        self.assertEqual(len(transform_parameters), 4)
        self.assertAlmostEqual(
            float(transform_parameters[0]),
            float(moving_object_size_value) / float(fixed_object_size_value),
            1,
        )


if __name__ == "__main__":
    unittest.main()
