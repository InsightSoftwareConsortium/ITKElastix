import test from "ava";
import path from "path";
import fs from "fs";

import { elastixNode, transformixNode } from "../../dist/index-node.js";
import { readImageNode } from "@itk-wasm/image-io";

const testDataInputDirectory = path.resolve("..", "test", "data", "input");

async function readHeadImages() {
  const fixed = await readImageNode(
    path.join(testDataInputDirectory, "CT_2D_head_fixed.iwi.cbor")
  );
  const moving = await readImageNode(
    path.join(testDataInputDirectory, "CT_2D_head_moving.iwi.cbor")
  );
  return { fixed, moving };
}

function readParameterObject(fileName) {
  return JSON.parse(
    fs.readFileSync(path.join(testDataInputDirectory, fileName))
  );
}

function meanAbsoluteDifference(a, b) {
  if (a.data.length !== b.data.length) {
    throw new Error("Images have different numbers of pixels");
  }
  let sum = 0;
  for (let i = 0; i < a.data.length; ++i) {
    sum += Math.abs(a.data[i] - b.data[i]);
  }
  return sum / a.data.length;
}

async function register() {
  const { fixed, moving } = await readHeadImages();
  const parameterObject = readParameterObject("parameters_single.json");
  const { result, transform, transformParameterObject } = await elastixNode(
    parameterObject,
    { fixed, moving }
  );
  return { fixed, moving, registered: result, transform, transformParameterObject };
}

test("Apply an elastix transform parameter object", async (t) => {
  const { moving, registered, transformParameterObject } = await register();

  const { result } = await transformixNode(moving, { transformParameterObject });

  t.is(result.imageType.dimension, 2);
  t.is(result.imageType.componentType, "int16");
  t.deepEqual(result.size, registered.size);
  // transformix reproduces the resampled image elastix produced.
  t.true(meanAbsoluteDifference(result, registered) < 0.01);
});

test("Apply an ITK transform", async (t) => {
  const { fixed, moving, registered, transform } = await register();
  t.deepEqual(
    transform.map((x) => x.transformType.transformParameterization),
    ["Composite", "Affine"]
  );

  // The elastix output TransformList is applied directly, with the output
  // image domain taken from the fixed image.
  const { result } = await transformixNode(moving, {
    transform,
    outputOrigin: fixed.origin,
    outputSpacing: fixed.spacing,
    outputSize: fixed.size,
    outputDirection: Array.from(fixed.direction),
  });

  t.is(result.imageType.dimension, 2);
  t.deepEqual(result.size, fixed.size);
  t.deepEqual(result.origin, fixed.origin);
  t.deepEqual(result.spacing, fixed.spacing);
  const difference = meanAbsoluteDifference(result, registered);
  t.true(difference < 1.0, `mean absolute difference ${difference}`);
});

test("Apply an ITK transform with the domain from a parameter object", async (t) => {
  const { moving, registered, transform, transformParameterObject } =
    await register();

  // With both, the parameter object only supplies the output image domain and
  // the resample interpolator.
  const { result } = await transformixNode(moving, {
    transform,
    transformParameterObject,
  });

  t.deepEqual(result.size, registered.size);
  const difference = meanAbsoluteDifference(result, registered);
  t.true(difference < 1.0, `mean absolute difference ${difference}`);
});

test("The output image domain defaults to the moving image domain", async (t) => {
  const { moving, transform } = await register();

  const { result } = await transformixNode(moving, { transform });

  t.deepEqual(result.size, moving.size);
  t.deepEqual(result.origin, moving.origin);
  t.deepEqual(result.spacing, moving.spacing);
});

test("A transform parameter object or an ITK transform is required", async (t) => {
  const { moving } = await readHeadImages();

  await t.throwsAsync(() => transformixNode(moving, {}));
});
