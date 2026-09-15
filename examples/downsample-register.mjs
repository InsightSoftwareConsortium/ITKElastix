#!/usr/bin/env node

/*

This example demonstrates how to use the @itk-wasm/elastix module.

It shows how to:

1. Register with elastix
2. Apply the resulting transform with transformix
3. Downsample the input images.
4. Register the downsampled images.
5. Apply the resulting transform at the original resolution.

*/

import path from "path";

import { readImageNode, writeImageNode } from "@itk-wasm/image-io";
import { downsampleNode } from "@itk-wasm/downsample";
import {
  elastixNode,
  defaultParameterMapNode,
  transformixNode,
} from "@itk-wasm/elastix";

// ------------------------------------------------------------------
// Read output input fixed and moving images
const fixedImagePath = path.join(
  import.meta.dirname,
  "data",
  "CT_2D_head_fixed.mha"
);
const movingImagePath = path.join(
  import.meta.dirname,
  "data",
  "CT_2D_head_moving.mha"
);
const fixedImage = await readImageNode(fixedImagePath);
const movingImage = await readImageNode(movingImagePath);
console.log("Fixed image:", fixedImage);
console.log("Moving image:", movingImage);

// ------------------------------------------------------------------
// Perform registration at full resolution
const { parameterMap: translationParameterMap } = await defaultParameterMapNode(
  "translation",
  {
    numberOfResolutions: 2,
  }
);
const { parameterMap: bsplineParameterMap } = await defaultParameterMapNode(
  "bspline",
  {
    numberOfResolutions: 2,
  }
);
const parameterObject = [translationParameterMap, bsplineParameterMap];
const { result, transformParameterObject } = await elastixNode(
  parameterObject,
  {
    fixed: fixedImage,
    moving: movingImage,
  }
);
await writeImageNode(result, "result.mha");

// ------------------------------------------------------------------
// Use the transform to resample the moving image
const { result: resampledMovingImage } = await transformixNode(
  movingImage,
  transformParameterObject
);
// Same as result.mha
await writeImageNode(resampledMovingImage, "resampled-moving.mha");

// ------------------------------------------------------------------
// Generate a downsampled version of the fixed and moving images
const shrinkFactors = [2, 2];
const { downsampled: downsampledFixedImage } = await downsampleNode(
  fixedImage,
  {
    shrinkFactors,
  }
);
const { downsampled: downsampledMovingImage } = await downsampleNode(
  movingImage,
  {
    shrinkFactors,
  }
);
console.log("Downsampled fixed image:", downsampledFixedImage);
console.log("Downsampled moving image:", downsampledMovingImage);

// ------------------------------------------------------------------
// Perform registration at downsampled resolution
const {
  result: resultDownsampled,
  transformParameterObject: transformParameterObjectDownsampled,
} = await elastixNode(parameterObject, {
  fixed: downsampledFixedImage,
  moving: downsampledMovingImage,
});
await writeImageNode(resultDownsampled, "result-downsampled.mha");

// ------------------------------------------------------------------
// Use the transform to resample the moving image at its original resolution
const { result: resampledMovingImageViaDownsampleTransform } =
  await transformixNode(movingImage, transformParameterObjectDownsampled, {
    outputOrigin: fixedImage.origin,
    outputSpacing: fixedImage.spacing,
    outputDirection: fixedImage.direction,
    outputSize: fixedImage.size,
  });
await writeImageNode(
  resampledMovingImageViaDownsampleTransform,
  "resampled-moving-via-downsample-transform.mha"
);
