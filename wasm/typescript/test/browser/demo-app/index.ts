import * as elastix from "../../../dist/index.js";

import * as imageIo from "@itk-wasm/image-io";
globalThis.imageIo = imageIo;

// Use local, vendored WebAssembly module assets
const viteBaseUrl = import.meta.env.BASE_URL;
const pipelinesBaseUrl: string | URL = new URL(
  `${viteBaseUrl}pipelines`,
  document.location.origin
).href;
elastix.setPipelinesBaseUrl(pipelinesBaseUrl);
imageIo.setPipelinesBaseUrl(pipelinesBaseUrl);

const params = new URLSearchParams(window.location.search);
if (!params.has("functionName")) {
  params.set("functionName", "elastix");
  const url = new URL(document.location);
  url.search = params;
  window.history.replaceState({ functionName: "elastix" }, "", url);
}

import "./default-parameter-map-controller.js";
import "./elastix-controller.js";
import "./read-parameter-files-controller.js";
import "./write-parameter-files-controller.js";
