# @itk-wasm/elastix

[![npm version](https://badge.fury.io/js/@itk-wasm%2Felastix.svg)](https://www.npmjs.com/package/@itk-wasm/elastix)

> A toolbox for rigid and nonrigid registration of images.

## Installation

```sh
npm install @itk-wasm/elastix
```

## Usage

### Browser interface

Import:

```js
import {
  elastixWasm,
  setPipelinesBaseUrl,
  getPipelinesBaseUrl,
  setPipelineWorkerUrl,
  getPipelineWorkerUrl,
} from "@itk-wasm/elastix"
```

#### elastixWasm

*Rigid and non-rigid registration of images.*

```ts
async function elastixWasm(
  webWorker: null | Worker,
  options: ElastixWasmOptions = {}
) : Promise<ElastixWasmResult>
```

| Parameter | Type | Description |
| :-------: | :--: | :---------- |

**`ElastixWasmOptions` interface:**

| Property |   Type  | Description  |
| :------: | :-----: | :----------- |
|  `fixed` | *Image* | Fixed image  |
| `moving` | *Image* | Moving image |

**`ElastixWasmResult` interface:**

|    Property   |   Type   | Description                    |
| :-----------: | :------: | :----------------------------- |
| **webWorker** | *Worker* | WebWorker used for computation |
|    `result`   |  *Image* | The result image               |

#### setPipelinesBaseUrl

*Set base URL for WebAssembly assets when vendored.*

```ts
function setPipelinesBaseUrl(
  baseUrl: string | URL
) : void
```

#### getPipelinesBaseUrl

*Get base URL for WebAssembly assets when vendored.*

```ts
function getPipelinesBaseUrl() : string | URL
```

#### setPipelineWorkerUrl

*Set base URL for the itk-wasm pipeline worker script when vendored.*

```ts
function setPipelineWorkerUrl(
  baseUrl: string | URL
) : void
```

#### getPipelineWorkerUrl

*Get base URL for the itk-wasm pipeline worker script when vendored.*

```ts
function getPipelineWorkerUrl() : string | URL
```

### Node interface

Import:

```js
import {
  elastixWasmNode,
  setPipelinesBaseUrl,
  getPipelinesBaseUrl,
  setPipelineWorkerUrl,
  getPipelineWorkerUrl,
} from "@itk-wasm/elastix"
```

#### elastixWasmNode

*Rigid and non-rigid registration of images.*

```ts
async function elastixWasmNode(
  options: ElastixWasmOptions = {}
) : Promise<ElastixWasmNodeResult>
```

| Parameter | Type | Description |
| :-------: | :--: | :---------- |

**`ElastixWasmNodeOptions` interface:**

| Property |   Type  | Description  |
| :------: | :-----: | :----------- |
|  `fixed` | *Image* | Fixed image  |
| `moving` | *Image* | Moving image |

**`ElastixWasmNodeResult` interface:**

| Property |   Type  | Description      |
| :------: | :-----: | :--------------- |
| `result` | *Image* | The result image |
