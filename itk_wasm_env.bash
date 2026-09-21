#!/usr/bin/env bash

function die() {
    echo "$1"
    exit 1
}

# Resolve package.json relative to the project root rather than the current
# directory so that `pixi run` works from any subdirectory (pixi exports
# PIXI_PROJECT_ROOT before sourcing this script; fall back to the script's
# own directory when sourced by hand).
ITK_WASM_PACKAGE_JSON="${PIXI_PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}/package.json"

export ITK_WASM_DESCRIPTION=${ITK_WASM_DESCRIPTION:-$(cat "${ITK_WASM_PACKAGE_JSON}" | jq -e -r '."itk-wasm"."description"')}
if [[ "${ITK_WASM_DESCRIPTION}" = "null" ]]; then
    die "itk-wasm.description not set in package.json"
fi

export ITK_WASM_REPOSITORY=${ITK_WASM_REPOSITORY:-$(cat "${ITK_WASM_PACKAGE_JSON}" | jq -e -r '."itk-wasm"."repository"')}
if [[ "${ITK_WASM_REPOSITORY}" = "null" ]]; then
    die "itk-wasm.repository not set in package.json"
fi

export ITK_WASM_EMSCRIPTEN_DOCKER_IMAGE=${ITK_WASM_EMSCRIPTEN_DOCKER_IMAGE:-$(cat "${ITK_WASM_PACKAGE_JSON}" | jq -e -r '."itk-wasm"."emscripten-docker-image" // "itkwasm/emscripten:latest"')}
export ITK_WASM_WASI_DOCKER_IMAGE=${ITK_WASM_WASI_DOCKER_IMAGE:-$(cat "${ITK_WASM_PACKAGE_JSON}" | jq -e -r '."itk-wasm"."wasi-docker-image" // "itkwasm/wasi:latest"')}

export ITK_WASM_TEST_DATA_HASH=${ITK_WASM_TEST_DATA_HASH:-$(cat "${ITK_WASM_PACKAGE_JSON}" | jq -e -r '."itk-wasm"."test-data-hash"')}
export ITK_WASM_TEST_DATA_URLS=${ITK_WASM_TEST_DATA_URLS:-$(cat "${ITK_WASM_PACKAGE_JSON}" | jq -e -r '."itk-wasm"."test-data-urls" | join(" ")')}

export ITK_WASM_TYPESCRIPT_PACKAGE_NAME=${ITK_WASM_TYPESCRIPT_PACKAGE_NAME:-$(cat "${ITK_WASM_PACKAGE_JSON}" | jq -e -r '."itk-wasm"."typescript-package-name"')}
if [[ "${ITK_WASM_TYPESCRIPT_PACKAGE_NAME}" = "null" ]]; then
    die "itk-wasm.typescript-package-name not set in package.json"
fi
export ITK_WASM_TYPESCRIPT_OUTPUT_DIR=${ITK_WASM_TYPESCRIPT_OUTPUT_DIR:-$(cat "${ITK_WASM_PACKAGE_JSON}" | jq -e -r '."itk-wasm"."typescript-output-dir" // "typescript"')}

export ITK_WASM_PYTHON_PACKAGE_NAME=${ITK_WASM_PYTHON_PACKAGE_NAME:-$(cat "${ITK_WASM_PACKAGE_JSON}" | jq -e -r '."itk-wasm"."python-package-name"')}
if [[ "${ITK_WASM_PYTHON_PACKAGE_NAME}" = "null" ]]; then
    die "itk-wasm.python-package-name not set in package.json"
fi
export ITK_WASM_PYTHON_OUTPUT_DIR=${ITK_WASM_PYTHON_OUTPUT_DIR:-$(cat "${ITK_WASM_PACKAGE_JSON}" | jq -e -r '."itk-wasm"."python-output-dir" // "python"')}

export ITK_WASM_PACKAGE_VERSION=${ITK_WASM_PACKAGE_VERSION:-$(cat "${ITK_WASM_PACKAGE_JSON}" | jq -e -r '."itk-wasm"."package-version"')}
if [[ "${ITK_WASM_PACKAGE_VERSION}" = "null" ]]; then
    die "itk-wasm.package-version not set in package.json"
fi

env