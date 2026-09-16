import test from "ava";
import path from "path";
import fs from "fs";

import { elastixNode } from "../../dist/index-node.js";
import { readImageNode } from "@itk-wasm/image-io";
import {
  FloatTypes,
  Transform,
  TransformParameterizations,
  TransformType,
} from "itk-wasm";

const testDataInputDirectory = path.resolve("..", "test", "data", "input");
const testDataOutputDirectory = path.resolve("..", "test", "data", "output");
try {
  fs.mkdirSync(testDataOutputDirectory);
} catch (e) {
  if (e.code !== "EEXIST") {
    throw e;
  }
}

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

function parameterizations(transformList) {
  return transformList.map((t) => t.transformType.transformParameterization);
}

test("Default 2D registration", async (t) => {
  const { fixed, moving } = await readHeadImages();
  const parameterObject = readParameterObject("parameters_single.json");
  const { result, transform, transformParameterObject } = await elastixNode(
    parameterObject,
    {
      fixed,
      moving,
    }
  );

  t.is(result.imageType.dimension, 2);
  t.is(result.imageType.componentType, "int16");
  t.is(result.size[0], 256);
  t.is(result.size[1], 256);

  // The fixed-to-moving transform is an itk-wasm TransformList: a composite
  // marker followed by the ITK transforms converted from the optimized
  // elastix transforms.
  t.true(Array.isArray(transform));
  t.deepEqual(parameterizations(transform), ["Composite", "Affine"]);
  const affine = transform[1];
  t.is(affine.transformType.parametersValueType, "float64");
  t.is(affine.transformType.inputDimension, 2);
  t.is(affine.transformType.outputDimension, 2);
  t.is(affine.numberOfParameters, 6);
  t.is(affine.parameters.length, 6);
  t.is(affine.numberOfFixedParameters, 2);
  t.is(affine.fixedParameters.length, 2);
  // The optimized affine should be close to the identity for this data.
  t.true(Math.abs(affine.parameters[0] - 1.0) < 0.2);
  t.true(Math.abs(affine.parameters[3] - 1.0) < 0.2);

  t.is(transformParameterObject.length, 1);
  t.deepEqual(transformParameterObject[0].Transform, ["AffineTransform"]);
});

test("Multiple parameter maps produce a composite of the stage transforms", async (t) => {
  const { fixed, moving } = await readHeadImages();
  const parameterObject = readParameterObject("parameters_multiple.json");
  const { result, transform, transformParameterObject } = await elastixNode(
    parameterObject,
    {
      fixed,
      moving,
    }
  );

  t.is(result.imageType.dimension, 2);
  t.is(transformParameterObject.length, 2);

  const kinds = parameterizations(transform);
  t.is(kinds.length, 3);
  t.is(kinds[0], "Composite");
  t.true(kinds.includes("Translation"));
  t.true(kinds.includes("Affine"));
  const translation = transform[kinds.indexOf("Translation")];
  t.is(translation.numberOfParameters, 2);
  t.is(translation.parameters.length, 2);
});

test("Single ITK transform as the initial transform", async (t) => {
  const { fixed, moving } = await readHeadImages();
  const parameterObject = readParameterObject("parameters_single.json");

  // A single, non-composite ITK transform as the initial transform.
  const translation = new Transform(
    new TransformType(
      TransformParameterizations.Translation,
      FloatTypes.Float64,
      2,
      2
    )
  );
  translation.numberOfParameters = 2;
  translation.parameters = new Float64Array([2.0, -3.0]);
  translation.numberOfFixedParameters = 0;
  translation.fixedParameters = new Float64Array(0);

  const { result, transform } = await elastixNode(parameterObject, {
    fixed,
    moving,
    initialTransform: [translation],
  });

  t.is(result.imageType.dimension, 2);
  t.is(result.size[0], 256);

  // The output composite lists the optimized affine first and the initial
  // transform last. itk.CompositeTransform applies its queue in reverse, so
  // the initial translation is applied to a point before the affine.
  t.deepEqual(parameterizations(transform), [
    "Composite",
    "Affine",
    "Translation",
  ]);
  t.deepEqual(Array.from(transform[2].parameters), [2.0, -3.0]);
});

test("Composite output transform can be used as the initial transform", async (t) => {
  const { fixed, moving } = await readHeadImages();
  const parameterObject = readParameterObject("parameters_single.json");
  const { transform: firstTransform } = await elastixNode(parameterObject, {
    fixed,
    moving,
  });
  t.deepEqual(parameterizations(firstTransform), ["Composite", "Affine"]);

  const { result, transform } = await elastixNode(parameterObject, {
    fixed,
    moving,
    initialTransform: firstTransform,
  });

  t.is(result.imageType.dimension, 2);
  // The initial composite is flattened into the output composite, followed
  // by the newly optimized affine.
  t.deepEqual(parameterizations(transform), ["Composite", "Affine", "Affine"]);
  t.is(transform[1].numberOfParameters, 6);
  t.is(transform[2].numberOfParameters, 6);
});
