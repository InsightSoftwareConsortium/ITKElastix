from itkwasm_elastix_wasi import read_parameter_files

from .common import test_input_path

def test_read_parameter_files():
    translation_file = test_input_path / 'parameters_Translation.txt'
    affine_file = test_input_path / 'parameters_Affine.txt'

    parameter_object = read_parameter_files([translation_file, affine_file])

    assert len(parameter_object) == 2
    assert parameter_object[0]['Transform'] == ['TranslationTransform']
    assert parameter_object[1]['Transform'] == ['AffineTransform']

def test_read_toml_parameter_files():
    # The .toml extension selects the TOML parameter file format
    translation_file = test_input_path / 'parameters_Translation.toml'
    affine_file = test_input_path / 'parameters_Affine.toml'

    parameter_object = read_parameter_files([translation_file, affine_file])

    assert len(parameter_object) == 2
    assert parameter_object[0]['Transform'] == ['TranslationTransform']
    assert parameter_object[1]['Transform'] == ['AffineTransform']
    # TOML integers and booleans are converted to elastix parameter value strings
    assert parameter_object[0]['NumberOfResolutions'] == ['4']
    assert parameter_object[0]['UseDirectionCosines'] == ['true']
    assert parameter_object[0]['ErodeMask'] == ['false']

def test_read_mixed_format_parameter_files():
    translation_file = test_input_path / 'parameters_Translation.toml'
    affine_file = test_input_path / 'parameters_Affine.txt'

    parameter_object = read_parameter_files([translation_file, affine_file])

    assert parameter_object[0]['Transform'] == ['TranslationTransform']
    assert parameter_object[1]['Transform'] == ['AffineTransform']

def test_toml_and_txt_parameter_files_read_equal():
    from_toml = read_parameter_files([test_input_path / 'parameters_Translation.toml'])
    from_txt = read_parameter_files([test_input_path / 'parameters_Translation.txt'])

    assert from_toml == from_txt
