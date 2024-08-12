from pathlib import Path

test_input_path = Path(__file__).parent / ".." / ".." / ".." / "test" / "data" / "input"
test_baseline_path = Path(__file__).parent / ".." / ".." / ".." / "test" / "data" / "baseline"
test_output_path = Path(__file__).parent / ".." / ".." / ".." / "test" / "data" / "output" / "python"
test_output_path.mkdir(parents=True, exist_ok=True)