# @itk-wasm/elastix

[![npm version](https://badge.fury.io/js/@itk-wasm%2Felastix.svg)](https://www.npmjs.com/package/@itk-wasm/elastix)

> A toolbox for rigid and nonrigid registration of images.

The demo performs affine registration with elastix entirely in the browser: it takes OME-Zarr, OME-TIFF, or any ITK-readable images as input, renders the fixed, moving, and registered images with niivue, and writes the registered image and the fixed-to-moving transform back out as OME-Zarr.

[👨‍💻 **Live Demo** ✨](https://insightsoftwareconsortium.github.io/ITKElastix/ ':include :type=iframe width=100% height=800px')

[🕮 **Documentation** 📚](https://js.docs.elastix.wasm.itk.eth.limo/)

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
  transformix,
  writeParameterFiles,
  setPipelinesBaseUrl,
  getPipelinesBaseUrl,
} from "@itk-wasm/elastix"
```

#### defaultParameterMap

*Returns the default elastix parameter map for a given transform type.*

```ts
async function defaultParameterMap(
  transformName: string,
  options: DefaultParameterMapOptions = {}
) : Promise<DefaultParameterMapResult>
```

|    Parameter    |   Type   | Description                                                                    |
| :-------------: | :------: | :----------------------------------------------------------------------------- |
| `transformName` | *string* | Transform name. One of: translation, rigid, affine, bspline, spline, groupwise |

**`DefaultParameterMapOptions` interface:**

|        Property       |             Type            | Description                                                                                                                                           |
| :-------------------: | :-------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `numberOfResolutions` |           *number*          | Number of multiscale registration resolutions.                                                                                                        |
|   `finalGridSpacing`  |           *number*          | Final grid spacing in physical units for bspline transforms.                                                                                          |
|      `webWorker`      | *null or Worker or boolean* | WebWorker for computation. Set to null to create a new worker. Or, pass an existing worker. Or, set to `false` to run in the current thread / worker. |
|        `noCopy`       |          *boolean*          | When SharedArrayBuffer's are not available, do not copy inputs.                                                                                       |

**`DefaultParameterMapResult` interface:**

|    Property    |       Type       | Description                          |
| :------------: | :--------------: | :----------------------------------- |
| `parameterMap` | *JsonCompatible* | Elastix parameter map representation |
|   `webWorker`  |     *Worker*     | WebWorker used for computation.      |

#### elastix

*Rigid and non-rigid registration of images.*

```ts
async function elastix(
  parameterObject: JsonCompatible,
  options: ElastixOptions = {}
) : Promise<ElastixResult>
```

|     Parameter     |       Type       | Description                             |
| :---------------: | :--------------: | :-------------------------------------- |
| `parameterObject` | *JsonCompatible* | Elastix parameter object representation |

**`ElastixOptions` interface:**

|              Property             |             Type            | Description                                                                                                                                           |
| :-------------------------------: | :-------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
|              `fixed`              |           *Image*           | Fixed image                                                                                                                                           |
|              `moving`             |           *Image*           | Moving image                                                                                                                                          |
|         `initialTransform`        |       *TransformList*       | Initial ITK transform to apply before registration. Only provide this or an initial transform parameter object.                                       |
| `initialTransformParameterObject` |       *JsonCompatible*      | Initial elastix transform parameter object to apply before registration. Only provide this or an initial transform.                                   |
|            `webWorker`            | *null or Worker or boolean* | WebWorker for computation. Set to null to create a new worker. Or, pass an existing worker. Or, set to `false` to run in the current thread / worker. |
|              `noCopy`             |          *boolean*          | When SharedArrayBuffer's are not available, do not copy inputs.                                                                                       |

**`ElastixResult` interface:**

|          Property          |       Type       | Description                                                 |
| :------------------------: | :--------------: | :---------------------------------------------------------- |
|          `result`          |      *Image*     | Resampled moving image                                      |
|         `transform`        |  *TransformList* | Fixed-to-moving ITK transform                               |
| `transformParameterObject` | *JsonCompatible* | Elastix optimized transform parameter object representation |
|         `webWorker`        |     *Worker*     | WebWorker used for computation.                             |

#### readParameterFiles

*Read elastix parameter files, in the legacy text (.txt) or TOML (.toml) format, into a parameter object.*

```ts
async function readParameterFiles(
  options: ReadParameterFilesOptions = { parameterFiles: [] as TextFile[] | File[] | string[], }
) : Promise<ReadParameterFilesResult>
```

| Parameter | Type | Description |
| :-------: | :--: | :---------- |

**`ReadParameterFilesOptions` interface:**

|     Property     |               Type               | Description                                                                                                                                           |
| :--------------: | :------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parameterFiles` | *string[] | File[] | TextFile[]* | Elastix parameter files. The file extension selects the format: .txt for the legacy text format, .toml for TOML.                                      |
|    `webWorker`   |    *null or Worker or boolean*   | WebWorker for computation. Set to null to create a new worker. Or, pass an existing worker. Or, set to `false` to run in the current thread / worker. |
|     `noCopy`     |             *boolean*            | When SharedArrayBuffer's are not available, do not copy inputs.                                                                                       |

**`ReadParameterFilesResult` interface:**

|      Property     |       Type       | Description                             |
| :---------------: | :--------------: | :-------------------------------------- |
| `parameterObject` | *JsonCompatible* | Elastix parameter object representation |
|    `webWorker`    |     *Worker*     | WebWorker used for computation.         |

#### transformix

*Apply an elastix transform parameter object or an ITK transform to an image.*

```ts
async function transformix(
  moving: Image,
  options: TransformixOptions = {}
) : Promise<TransformixResult>
```

| Parameter |   Type  | Description  |
| :-------: | :-----: | :----------- |
|  `moving` | *Image* | Moving image |

**`TransformixOptions` interface:**

|          Property          |             Type            | Description                                                                                                                                                                 |
| :------------------------: | :-------------------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transformParameterObject` |       *JsonCompatible*      | Elastix transform parameter object to apply. Provide this and/or an ITK transform. When both are provided, only its output image domain and resample interpolator are used. |
|         `transform`        |       *TransformList*       | ITK transform to apply. Provide this and/or a transform parameter object. The output image domain defaults to the moving image domain.                                      |
|       `outputOrigin`       |          *number[]*         | Output image origin.                                                                                                                                                        |
|       `outputSpacing`      |          *number[]*         | Output image spacing.                                                                                                                                                       |
|        `outputSize`        |          *number[]*         | Output image size.                                                                                                                                                          |
|      `outputDirection`     |          *number[]*         | Output image orientation direction matrix.                                                                                                                                  |
|         `webWorker`        | *null or Worker or boolean* | WebWorker for computation. Set to null to create a new worker. Or, pass an existing worker. Or, set to `false` to run in the current thread / worker.                       |
|          `noCopy`          |          *boolean*          | When SharedArrayBuffer's are not available, do not copy inputs.                                                                                                             |

**`TransformixResult` interface:**

|   Property  |   Type   | Description                     |
| :---------: | :------: | :------------------------------ |
|   `result`  |  *Image* | Resampled moving image          |
| `webWorker` | *Worker* | WebWorker used for computation. |

#### writeParameterFiles

*Write elastix parameter files, in the legacy text (.txt) or TOML (.toml) format, from a parameter object.*

```ts
async function writeParameterFiles(
  parameterObject: JsonCompatible,
  parameterFiles: string[],
  options: WriteParameterFilesOptions = {}
) : Promise<WriteParameterFilesResult>
```

|     Parameter     |       Type       | Description                                                                                                                                                                                    |
| :---------------: | :--------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parameterObject` | *JsonCompatible* | Elastix parameter object representation.                                                                                                                                                       |
|  `parameterFiles` |    *string[]*    | Elastix parameter files, must have the same length as the number of parameter maps in the parameter object. The file extension selects the format: .txt for the legacy text format, .toml for TOML. |

**`WriteParameterFilesOptions` interface:**

|   Property  |             Type            | Description                                                                                                                                           |
| :---------: | :-------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webWorker` | *null or Worker or boolean* | WebWorker for computation. Set to null to create a new worker. Or, pass an existing worker. Or, set to `false` to run in the current thread / worker. |
|   `noCopy`  |          *boolean*          | When SharedArrayBuffer's are not available, do not copy inputs.                                                                                       |

**`WriteParameterFilesResult` interface:**

|     Property     |     Type     | Description                                                                                                                                                                                    |
| :--------------: | :----------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parameterFiles` | *TextFile[]* | Elastix parameter files, must have the same length as the number of parameter maps in the parameter object. The file extension selects the format: .txt for the legacy text format, .toml for TOML. |
|    `webWorker`   |   *Worker*   | WebWorker used for computation.                                                                                                                                                                |

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


### Node interface

Import:

```js
import {
  defaultParameterMapNode,
  elastixNode,
  readParameterFilesNode,
  transformixNode,
  writeParameterFilesNode,
} from "@itk-wasm/elastix"
```

#### defaultParameterMapNode

*Returns the default elastix parameter map for a given transform type.*

```ts
async function defaultParameterMapNode(
  transformName: string,
  options: DefaultParameterMapNodeOptions = {}
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
  options: ElastixNodeOptions = {}
) : Promise<ElastixNodeResult>
```

|     Parameter     |       Type       | Description                             |
| :---------------: | :--------------: | :-------------------------------------- |
| `parameterObject` | *JsonCompatible* | Elastix parameter object representation |

**`ElastixNodeOptions` interface:**

|              Property             |       Type       | Description                                                                                                         |
| :-------------------------------: | :--------------: | :------------------------------------------------------------------------------------------------------------------ |
|              `fixed`              |      *Image*     | Fixed image                                                                                                         |
|              `moving`             |      *Image*     | Moving image                                                                                                        |
|         `initialTransform`        |  *TransformList* | Initial ITK transform to apply before registration. Only provide this or an initial transform parameter object.     |
| `initialTransformParameterObject` | *JsonCompatible* | Initial elastix transform parameter object to apply before registration. Only provide this or an initial transform. |

**`ElastixNodeResult` interface:**

|          Property          |       Type       | Description                                                 |
| :------------------------: | :--------------: | :---------------------------------------------------------- |
|          `result`          |      *Image*     | Resampled moving image                                      |
|         `transform`        |  *TransformList* | Fixed-to-moving ITK transform                               |
| `transformParameterObject` | *JsonCompatible* | Elastix optimized transform parameter object representation |

#### readParameterFilesNode

*Read elastix parameter files, in the legacy text (.txt) or TOML (.toml) format, into a parameter object.*

```ts
async function readParameterFilesNode(
  options: ReadParameterFilesNodeOptions = { parameterFiles: [] as string[], }
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

#### transformixNode

*Apply an elastix transform parameter object or an ITK transform to an image.*

```ts
async function transformixNode(
  moving: Image,
  options: TransformixNodeOptions = {}
) : Promise<TransformixNodeResult>
```

| Parameter |   Type  | Description  |
| :-------: | :-----: | :----------- |
|  `moving` | *Image* | Moving image |

**`TransformixNodeOptions` interface:**

|          Property          |       Type       | Description                                                                                                                                                                 |
| :------------------------: | :--------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transformParameterObject` | *JsonCompatible* | Elastix transform parameter object to apply. Provide this and/or an ITK transform. When both are provided, only its output image domain and resample interpolator are used. |
|         `transform`        |  *TransformList* | ITK transform to apply. Provide this and/or a transform parameter object. The output image domain defaults to the moving image domain.                                      |
|       `outputOrigin`       |    *number[]*    | Output image origin.                                                                                                                                                        |
|       `outputSpacing`      |    *number[]*    | Output image spacing.                                                                                                                                                       |
|        `outputSize`        |    *number[]*    | Output image size.                                                                                                                                                          |
|      `outputDirection`     |    *number[]*    | Output image orientation direction matrix.                                                                                                                                  |

**`TransformixNodeResult` interface:**

| Property |   Type  | Description            |
| :------: | :-----: | :--------------------- |
| `result` | *Image* | Resampled moving image |

#### writeParameterFilesNode

*Write elastix parameter files, in the legacy text (.txt) or TOML (.toml) format, from a parameter object.*

```ts
async function writeParameterFilesNode(
  parameterObject: JsonCompatible,
  parameterFiles: string[]
) : Promise<WriteParameterFilesNodeResult>
```

|     Parameter     |       Type       | Description                                                                                                                                                                                    |
| :---------------: | :--------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parameterObject` | *JsonCompatible* | Elastix parameter object representation.                                                                                                                                                       |
|  `parameterFiles` |    *string[]*    | Elastix parameter files, must have the same length as the number of parameter maps in the parameter object. The file extension selects the format: .txt for the legacy text format, .toml for TOML. |

**`WriteParameterFilesNodeResult` interface:**

|     Property     |     Type     | Description                                                                                                 |
| :--------------: | :----------: | :---------------------------------------------------------------------------------------------------------- |
| `parameterFiles` | *TextFile[]* | Elastix parameter files, must have the same length as the number of parameter maps in the parameter object. |
