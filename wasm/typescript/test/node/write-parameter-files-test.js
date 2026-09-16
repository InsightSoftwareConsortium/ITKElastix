import test from "ava";
import path from "path";
import fs from "fs";

import {
  readParameterFilesNode,
  writeParameterFilesNode,
} from "../../dist/index-node.js";

const testDataInputDirectory = path.resolve("..", "test", "data", "input");
const testDataOutputDirectory = path.resolve("..", "test", "data", "output");
try {
  fs.mkdirSync(testDataOutputDirectory);
} catch (e) {
  if (e.code !== "EEXIST") {
    throw e;
  }
}

function readParametersMultiple() {
  const parametersMultipleFile = path.join(
    testDataInputDirectory,
    "parameters_multiple.json"
  );
  return JSON.parse(fs.readFileSync(parametersMultipleFile));
}

test("Write parameter files", async (t) => {
  const parametersMultiple = readParametersMultiple();
  const translationFile = path.join(
    testDataOutputDirectory,
    "parameters_Translation.txt"
  );
  const affineFile = path.join(
    testDataOutputDirectory,
    "parameters_Affine.txt"
  );

  await writeParameterFilesNode(parametersMultiple, [
    translationFile,
    affineFile,
  ]);
  t.pass();
});

test("Write TOML parameter files", async (t) => {
  const parametersMultiple = readParametersMultiple();
  const translationFile = path.join(
    testDataOutputDirectory,
    "parameters_Translation.toml"
  );
  const affineFile = path.join(
    testDataOutputDirectory,
    "parameters_Affine.toml"
  );

  await writeParameterFilesNode(parametersMultiple, [
    translationFile,
    affineFile,
  ]);

  // The .toml extension selects the TOML format
  const translationToml = fs.readFileSync(translationFile, {
    encoding: "utf8",
  });
  t.true(translationToml.includes('Transform = "TranslationTransform"'));
  t.true(translationToml.includes("NumberOfResolutions = 4"));
  t.true(translationToml.includes("UseDirectionCosines = true"));
  t.false(translationToml.includes("(Transform"));

  const affineToml = fs.readFileSync(affineFile, { encoding: "utf8" });
  t.true(affineToml.includes('Transform = "AffineTransform"'));

  // Round trip
  const { parameterObject } = await readParameterFilesNode({
    parameterFiles: [translationFile, affineFile],
  });
  t.deepEqual(parameterObject, parametersMultiple);
});
