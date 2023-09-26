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
  defaultParameterMap,
  elastix,
  readParameterFiles,
  writeParameterFiles,
  setPipelinesBaseUrl,
  getPipelinesBaseUrl,
  setPipelineWorkerUrl,
  getPipelineWorkerUrl,
} from "@itk-wasm/elastix"
```

#### defaultParameterMap

*Returns the default elastix parameter map for a given transform type.*

```ts
async function defaultParameterMap(
  webWorker: null | Worker,
  transformName: string,
  options: DefaultParameterMapOptions = {}
) : Promise<DefaultParameterMapResult>
```

|    Parameter    |   Type   | Description                                                                    |
| :-------------: | :------: | :----------------------------------------------------------------------------- |
| `transformName` | *string* | Transform name. One of: translation, rigid, affine, bspline, spline, groupwise |

**`DefaultParameterMapOptions` interface:**

|        Property       |   Type   | Description                                                  |
| :-------------------: | :------: | :----------------------------------------------------------- |
| `numberOfResolutions` | *number* | Number of multiscale registration resolutions.               |
|   `finalGridSpacing`  | *number* | Final grid spacing in physical units for bspline transforms. |

**`DefaultParameterMapResult` interface:**

|    Property    |       Type       | Description                          |
| :------------: | :--------------: | :----------------------------------- |
|  **webWorker** |     *Worker*     | WebWorker used for computation       |
| `parameterMap` | *JsonCompatible* | Elastix parameter map representation |

#### elastix

*Rigid and non-rigid registration of images.*

```ts
async function elastix(
  webWorker: null | Worker,
  parameterObject: JsonCompatible,
  options: ElastixOptions = {}
) : Promise<ElastixResult>
```

|     Parameter     |       Type       | Description                             |
| :---------------: | :--------------: | :-------------------------------------- |
| `parameterObject` | *JsonCompatible* | Elastix parameter object representation |

**`ElastixOptions` interface:**

|              Property             |             Type             | Description                                                                                                         |
| :-------------------------------: | :--------------------------: | :------------------------------------------------------------------------------------------------------------------ |
|              `fixed`              |            *Image*           | Fixed image                                                                                                         |
|              `moving`             |            *Image*           | Moving image                                                                                                        |
|         `initialTransform`        | *string | File | BinaryFile* | Initial transform to apply before registration                                                                      |
| `initialTransformParameterObject` |       *JsonCompatible*       | Initial elastix transform parameter object to apply before registration. Only provide this or an initial transform. |
|          `transformPath`          |           *string*           | Fixed-to-moving transform path                                                                                      |

**`ElastixResult` interface:**

|          Property          |       Type       | Description                                                 |
| :------------------------: | :--------------: | :---------------------------------------------------------- |
|        **webWorker**       |     *Worker*     | WebWorker used for computation                              |
|          `result`          |      *Image*     | Resampled moving image                                      |
|         `transform`        |   *BinaryFile*   | Fixed-to-moving transform                                   |
| `transformParameterObject` | *JsonCompatible* | Elastix optimized transform parameter object representation |

#### readParameterFiles

*Read an elastix parameter text file into a parameter object.*

```ts
async function readParameterFiles(
  webWorker: null | Worker,
  options: ReadParameterFilesOptions = { parameterFiles: [] as TextFile[] | File[] | string[], }
) : Promise<ReadParameterFilesResult>
```

| Parameter | Type | Description |
| :-------: | :--: | :---------- |

**`ReadParameterFilesOptions` interface:**

|     Property     |               Type               | Description             |
| :--------------: | :------------------------------: | :---------------------- |
| `parameterFiles` | *string[] | File[] | TextFile[]* | Elastix parameter files |

**`ReadParameterFilesResult` interface:**

|      Property     |       Type       | Description                             |
| :---------------: | :--------------: | :-------------------------------------- |
|   **webWorker**   |     *Worker*     | WebWorker used for computation          |
| `parameterObject` | *JsonCompatible* | Elastix parameter object representation |

#### writeParameterFiles

*Write an elastix parameter text file from a parameter object.*

```ts
async function writeParameterFiles(
  webWorker: null | Worker,
  parameterObject: JsonCompatible,
  options: WriteParameterFilesOptions = {}
) : Promise<WriteParameterFilesResult>
```

|     Parameter     |       Type       | Description                             |
| :---------------: | :--------------: | :-------------------------------------- |
| `parameterObject` | *JsonCompatible* | Elastix parameter object representation |

**`WriteParameterFilesOptions` interface:**

|       Property       |    Type    | Description                  |
| :------------------: | :--------: | :--------------------------- |
| `parameterFilesPath` | *string[]* | Elastix parameter files path |

**`WriteParameterFilesResult` interface:**

|     Property     |     Type     | Description                    |
| :--------------: | :----------: | :----------------------------- |
|   **webWorker**  |   *Worker*   | WebWorker used for computation |
| `parameterFiles` | *TextFile[]* | Elastix parameter files        |

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
  defaultParameterMapNode,
  elastixNode,
  readParameterFilesNode,
  writeParameterFilesNode,
  setPipelinesBaseUrl,
  getPipelinesBaseUrl,
  setPipelineWorkerUrl,
  getPipelineWorkerUrl,
} from "@itk-wasm/elastix"
```

#### defaultParameterMapNode

*Returns the default elastix parameter map for a given transform type.*

```ts
async function defaultParameterMapNode(
  transformName: string,
  options: DefaultParameterMapOptions = {}
) : Promise<DefaultParameterMapNodeResult>
```

|    Parameter    |   Type   | Description                                                                    |
| :-------------: | :------: | :----------------------------------------------------------------------------- |
| `transformName` | *string* | Transform name. One of: translation, rigid, affine, bspline, spline, groupwise |

**`DefaultParameterMapNodeOptions` interface:**

|        Property       |   Type   | Description                                                  |
| :-------------------: | :------: | :----------------------------------------------------------- |
| `numberOfResolutions` | *number* | Number of multiscale registration resolutions.               |
|   `finalGridSpacing`  | *number* | Final grid spacing in physical units for bspline transforms. |

**`DefaultParameterMapNodeResult` interface:**

|    Property    |       Type       | Description                          |
| :------------: | :--------------: | :----------------------------------- |
| `parameterMap` | *JsonCompatible* | Elastix parameter map representation |

#### elastixNode

*Rigid and non-rigid registration of images.*

```ts
async function elastixNode(
  parameterObject: JsonCompatible,
  options: ElastixOptions = {}
) : Promise<ElastixNodeResult>
```

|     Parameter     |       Type       | Description                             |
| :---------------: | :--------------: | :-------------------------------------- |
| `parameterObject` | *JsonCompatible* | Elastix parameter object representation |

**`ElastixNodeOptions` interface:**

|              Property             |             Type             | Description                                                                                                         |
| :-------------------------------: | :--------------------------: | :------------------------------------------------------------------------------------------------------------------ |
|              `fixed`              |            *Image*           | Fixed image                                                                                                         |
|              `moving`             |            *Image*           | Moving image                                                                                                        |
|         `initialTransform`        | *string | File | BinaryFile* | Initial transform to apply before registration                                                                      |
| `initialTransformParameterObject` |       *JsonCompatible*       | Initial elastix transform parameter object to apply before registration. Only provide this or an initial transform. |
|          `transformPath`          |           *string*           | Fixed-to-moving transform path                                                                                      |

**`ElastixNodeResult` interface:**

|          Property          |       Type       | Description                                                 |
| :------------------------: | :--------------: | :---------------------------------------------------------- |
|          `result`          |      *Image*     | Resampled moving image                                      |
|         `transform`        |   *BinaryFile*   | Fixed-to-moving transform                                   |
| `transformParameterObject` | *JsonCompatible* | Elastix optimized transform parameter object representation |

#### readParameterFilesNode

*Read an elastix parameter text file into a parameter object.*

```ts
async function readParameterFilesNode(
  options: ReadParameterFilesOptions = { parameterFiles: [] as string[], }
) : Promise<ReadParameterFilesNodeResult>
```

| Parameter | Type | Description |
| :-------: | :--: | :---------- |

**`ReadParameterFilesNodeOptions` interface:**

|     Property     |               Type               | Description             |
| :--------------: | :------------------------------: | :---------------------- |
| `parameterFiles` | *string[] | File[] | TextFile[]* | Elastix parameter files |

**`ReadParameterFilesNodeResult` interface:**

|      Property     |       Type       | Description                             |
| :---------------: | :--------------: | :-------------------------------------- |
| `parameterObject` | *JsonCompatible* | Elastix parameter object representation |

#### writeParameterFilesNode

*Write an elastix parameter text file from a parameter object.*

```ts
async function writeParameterFilesNode(
  parameterObject: JsonCompatible,
  options: WriteParameterFilesOptions = {}
) : Promise<WriteParameterFilesNodeResult>
```

|     Parameter     |       Type       | Description                             |
| :---------------: | :--------------: | :-------------------------------------- |
| `parameterObject` | *JsonCompatible* | Elastix parameter object representation |

**`WriteParameterFilesNodeOptions` interface:**

|       Property       |    Type    | Description                  |
| :------------------: | :--------: | :--------------------------- |
| `parameterFilesPath` | *string[]* | Elastix parameter files path |

**`WriteParameterFilesNodeResult` interface:**

|     Property     |     Type     | Description             |
| :--------------: | :----------: | :---------------------- |
| `parameterFiles` | *TextFile[]* | Elastix parameter files |
