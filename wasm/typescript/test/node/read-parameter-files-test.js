import test from "ava";
import path from "path";
import fs from "fs";

import { readParameterFilesNode } from "../../dist/index-node.js";

const testDataInputDirectory = path.resolve("..", "test", "data", "input");

test("Read parameter files", async (t) => {
  const translationFile = path.join(
    testDataInputDirectory,
    "parameters_Translation.txt"
  );
  const affineFile = path.join(testDataInputDirectory, "parameters_Affine.txt");

  const { parameterObject } = await readParameterFilesNode({
    parameterFiles: [translationFile, affineFile],
  });

  t.is(parameterObject[0].Transform[0], "TranslationTransform");
  t.is(parameterObject[1].Transform[0], "AffineTransform");
});

test("Read TOML parameter files", async (t) => {
  const translationFile = path.join(
    testDataInputDirectory,
    "parameters_Translation.toml"
  );
  const affineFile = path.join(
    testDataInputDirectory,
    "parameters_Affine.toml"
  );

  const { parameterObject } = await readParameterFilesNode({
    parameterFiles: [translationFile, affineFile],
  });

  t.is(parameterObject.length, 2);
  t.is(parameterObject[0].Transform[0], "TranslationTransform");
  t.is(parameterObject[1].Transform[0], "AffineTransform");
  // TOML integers and booleans are converted to elastix parameter value strings
  t.deepEqual(parameterObject[0].NumberOfResolutions, ["4"]);
  t.deepEqual(parameterObject[0].UseDirectionCosines, ["true"]);
  t.deepEqual(parameterObject[0].ErodeMask, ["false"]);
});

test("Read a mix of TOML and legacy text parameter files", async (t) => {
  const translationFile = path.join(
    testDataInputDirectory,
    "parameters_Translation.toml"
  );
  const affineFile = path.join(testDataInputDirectory, "parameters_Affine.txt");

  const { parameterObject } = await readParameterFilesNode({
    parameterFiles: [translationFile, affineFile],
  });

  t.is(parameterObject[0].Transform[0], "TranslationTransform");
  t.is(parameterObject[1].Transform[0], "AffineTransform");
});

test("TOML and legacy text parameter files read to the same parameter object", async (t) => {
  const { parameterObject: fromToml } = await readParameterFilesNode({
    parameterFiles: [
      path.join(testDataInputDirectory, "parameters_Translation.toml"),
    ],
  });
  const { parameterObject: fromText } = await readParameterFilesNode({
    parameterFiles: [
      path.join(testDataInputDirectory, "parameters_Translation.txt"),
    ],
  });

  t.deepEqual(fromToml, fromText);
});
