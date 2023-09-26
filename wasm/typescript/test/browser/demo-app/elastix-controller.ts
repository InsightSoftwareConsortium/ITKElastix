import { readImageFile } from 'itk-wasm'
import { writeImageArrayBuffer, copyImage } from 'itk-wasm'
import * as elastix from '../../../dist/bundles/elastix.js'
import elastixLoadSampleInputs, { usePreRun, elastixLoadSample3dInputs } from "./elastix-load-sample-inputs.js"

class ElastixModel {

  inputs: Map<string, any>
  options: Map<string, any>
  outputs: Map<string, any>

  constructor() {
    this.inputs = new Map()
    this.options = new Map()
    this.outputs = new Map()
    }
  }


class ElastixController  {

  constructor(loadSampleInputs) {
    this.loadSampleInputs = loadSampleInputs

    this.model = new ElastixModel()
    const model = this.model

    this.webWorker = null

    if (loadSampleInputs) {
      const loadSampleInputsButton = document.querySelector("#elastixInputs [name=loadSampleInputs]")
      loadSampleInputsButton.setAttribute('style', 'display: block-inline;')
      loadSampleInputsButton.addEventListener('click', async (event) => {
        loadSampleInputsButton.loading = true
        await loadSampleInputs(model)
        loadSampleInputsButton.loading = false
      })
    }

    const loadSample3dInputsButton = document.querySelector("#elastixInputs [name=loadSample3dInputs]")
    loadSample3dInputsButton.setAttribute('style', 'display: block-inline;')
    loadSample3dInputsButton.addEventListener('click', async (event) => {
      loadSample3dInputsButton.loading = true
      await elastixLoadSample3dInputs(model)
      loadSample3dInputsButton.loading = false
    })

    // ----------------------------------------------
    // Inputs
    // const parameterObjectElement = document.querySelector('#elastixInputs input[name=parameter-object-file]')
    // parameterObjectElement.addEventListener('change', async (event) => {
    //     const dataTransfer = event.dataTransfer
    //     const files = event.target.files || dataTransfer.files

    //     const arrayBuffer = await files[0].arrayBuffer()
    //     model.inputs.set("parameterObject", JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer))))
    //     const details = document.getElementById("elastix-parameter-object-details")
    //     details.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(model.inputs.get("parameterObject"), globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
    //     details.disabled = false
    // })

    // ----------------------------------------------
    // Options
    const fixedElement = document.querySelector('#elastixInputs input[name=fixed-file]')
    fixedElement.addEventListener('change', async (event) => {
        const dataTransfer = event.dataTransfer
        const files = event.target.files || dataTransfer.files

        const { image, webWorker } = await readImageFile(null, files[0])
        webWorker.terminate()
        model.options.set("fixed", image)
        const details = document.getElementById("elastix-fixed-details")
        details.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(image, globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
        details.disabled = false
    })

    const movingElement = document.querySelector('#elastixInputs input[name=moving-file]')
    movingElement.addEventListener('change', async (event) => {
        const dataTransfer = event.dataTransfer
        const files = event.target.files || dataTransfer.files

        const { image, webWorker } = await readImageFile(null, files[0])
        webWorker.terminate()
        model.options.set("moving", image)
        const details = document.getElementById("elastix-moving-details")
        details.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(image, globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
        details.disabled = false
    })

    // const initialTransformElement = document.querySelector('#elastixInputs input[name=initial-transform-file]')
    // initialTransformElement.addEventListener('change', async (event) => {
    //     const dataTransfer = event.dataTransfer
    //     const files = event.target.files || dataTransfer.files

    //     const arrayBuffer = await files[0].arrayBuffer()
    //     model.options.set("initialTransform", { data: new Uint8Array(arrayBuffer), path: files[0].name })
    //     const details = document.getElementById("elastix-initial-transform-details")
    //     details.innerHTML = `<pre>${globalThis.escapeHtml(model.options.get("initialTransform").data.subarray(0, 50).toString() + ' ...')}</pre>`
    //     details.disabled = false
    // })

    // const transformElement = document.querySelector('#elastixInputs sl-input[name=transform]')
    // transformElement.addEventListener('sl-change', (event) => {
    //     model.options.set("transform", transformElement.value)
    // })
    model.options.set("transformPath", "transform.h5")

    // ----------------------------------------------
    // Outputs
    const resultOutputDownload = document.querySelector('#elastixOutputs sl-button[name=result-download]')
    this.resultOutputDownload = resultOutputDownload
    resultOutputDownload.addEventListener('click', async (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (model.outputs.has("result")) {
            const resultDownloadFormat = document.getElementById('result-output-format')
            const downloadFormat = resultDownloadFormat.value || 'nrrd'
            const fileName = `result.${downloadFormat}`
            const { webWorker, arrayBuffer } = await writeImageArrayBuffer(null, copyImage(model.outputs.get("result")), fileName)

            webWorker.terminate()
            globalThis.downloadFile(arrayBuffer, fileName)
        }
    })

    const transformOutputDownload = document.querySelector('#elastixOutputs sl-button[name=transform-download]')
    this.transformOutputDownload = transformOutputDownload
    transformOutputDownload.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (model.outputs.has("transform")) {
            globalThis.downloadFile(model.outputs.get("transform").data, model.outputs.get("transform").path)
        }
    })

    const preRun = async () => {
      if (!this.webWorker && loadSampleInputs && usePreRun) {
        await loadSampleInputs(model, true)
        await this.run(true)
        // await this.run(false)
      }
    }

    const onSelectTab = async (event) => {
      if (event.detail.name === 'elastix-panel') {
        const params = new URLSearchParams(window.location.search)
        if (!params.has('functionName') || params.get('functionName') !== 'elastix') {
          params.set('functionName', 'elastix')
          const url = new URL(document.location)
          url.search = params
          window.history.replaceState({ functionName: 'elastix' }, '', url)
        }
        // await preRun()
      }
    }

    const tabGroup = document.querySelector('sl-tab-group')
    tabGroup.addEventListener('sl-tab-show', onSelectTab)
    document.addEventListener('DOMContentLoaded', () => {
      const params = new URLSearchParams(window.location.search)
      if (params.has('functionName') && params.get('functionName') === 'elastix') {
        // preRun()
      }
    })

    const runButton = document.querySelector('#elastixInputs sl-button[name="run"]')
    runButton.addEventListener('click', async (event) => {
      event.preventDefault()

      // if(!model.inputs.has('parameterObject')) {
      //   globalThis.notify("Required input not provided", "parameterObject", "danger", "exclamation-octagon")
      //   return
      // }


      try {
        runButton.loading = true

        const t0 = performance.now()
        const { result, transform, transformParameterObject } = await this.run(false)
        const t1 = performance.now()
        globalThis.notify("elastix successfully completed", `in ${t1 - t0} milliseconds.`, "success", "rocket-fill")

        model.outputs.set("result", result)
        resultOutputDownload.variant = "success"
        resultOutputDownload.disabled = false
        const resultDetails = document.getElementById("elastix-result-details")
        resultDetails.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(result, globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
        resultDetails.disabled = false
        const resultOutput = document.getElementById('elastix-result-details')

        model.outputs.set("transform", transform)
        model.outputs.set("transformParameterObject", transformParameterObject)
        transformOutputDownload.variant = "success"
        transformOutputDownload.disabled = false
        const transformOutput = document.getElementById("elastix-transform-details")
        transformOutput.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(transformParameterObject, globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
        // transformOutput.innerHTML = `<pre>${globalThis.escapeHtml(transform.data.subarray(0, 1024).toString() + ' ...')}</pre>`
        transformOutput.disabled = false
      } catch (error) {
        globalThis.notify("Error while running pipeline", error.toString(), "danger", "exclamation-octagon")
        throw error
      } finally {
        runButton.loading = false
      }
    })
  }

  async run(preRun) {
    let viewer = null
    const toMultiscaleSpatialImage = globalThis.itkVtkViewer.utils.toMultiscaleSpatialImage
    const fixed = this.model.options.get('fixed')
    const moving = this.model.options.get('moving')
    const transformPath = this.model.options.get('transformPath')

    const parameterObject = []
    const stages = []

    const progressBar = document.getElementById('elastix-progress-bar')
    progressBar.setAttribute('style', 'display: block-inline;')
    progressBar.value = 0

    const { webWorker: defaultWorker, parameterMap: rigidMap } = await elastix.defaultParameterMap(this.webWorker,
      'rigid',
      { numberOfResolutions: 3 }
    )
    this.webWorker = defaultWorker
    parameterObject.push(rigidMap)
    stages.push('Rigid')

    const { parameterMap: affineMap } = await elastix.defaultParameterMap(this.webWorker,
      'affine',
      { numberOfResolutions: 3 }
    )
    parameterObject.push(affineMap)
    stages.push('Affine')

    const lengths = fixed.size.map((v, idx) => v * fixed.spacing[idx])
    const maxLength = Math.max(...lengths)

    const { parameterMap: roughSplineMap } = await elastix.defaultParameterMap(this.webWorker,
      'bspline',
      { numberOfResolutions: 3, finalGridSpacing: maxLength / 5 }
    )
    parameterObject.push(roughSplineMap)
    stages.push('Rough BSpline')

    const { parameterMap: fineSplineMap } = await elastix.defaultParameterMap(this.webWorker,
      'bspline',
      { numberOfResolutions: 4, finalGridSpacing: maxLength / 12 }
    )
    parameterObject.push(fineSplineMap)
    stages.push('Fine BSpline')

    if (!preRun) {
      const viewerElement = document.getElementById('viewer')
      const fixedImage = await toMultiscaleSpatialImage(copyImage(fixed))
      const movingImage = await toMultiscaleSpatialImage(copyImage(moving))
      const use2D = fixedImage.imageType.dimension === 2
      const config = {
        renderingViewContainerStyle:
          {
            "position": "relative",
            "width":"600px",
            "height":"400px",
            "minHeight":"400px",
            "minWidth":"600px",
            "maxHeight":"400px",
            "maxWidth":"600px",
            "margin":"0",
            "padding":"0",
            "top":"0",
            "left":"0",
            "overflow":"hidden"
          },
        uiCollapsed: true,
      }
      viewer = await globalThis.itkVtkViewer.createViewer(viewerElement,
        {
          image: movingImage,
          fixedImage,
          rotate: false,
          use2D,
          config,
          compare: { method: 'cyan-magenta', checkerboard: true },
        })
      setTimeout(() => {
        const animateLabel = document.querySelector('label[itk-vtk-tooltip-content="animate"]')
        const animateInput = animateLabel.parentElement.querySelector('input')
        animateInput.checked || animateInput.click()
      }, 4000)
    }

    let previousTransform
    let finalResult
    let finalTransform

    for (let idx = 0; idx < parameterObject.length; ++idx) {
      const stage = stages[idx]
      progressBar.textContent = `${stage} stage`
      progressBar.value = (idx / parameterObject.length) * 100
      console.log(stage)
      const map = [parameterObject[idx],]
      const { webWorker, result, transform, transformParameterObject } = await elastix.elastix(this.webWorker,
        map,
        {
          fixed: copyImage(fixed),
          moving: copyImage(moving),
          transformPath,
          initialTransformParameterObject: previousTransform,
        },
      )
      this.webWorker = webWorker

      if (!preRun) {
        const resultImage = await toMultiscaleSpatialImage(copyImage(result))
        await viewer.setImage(resultImage, 'Image')
      }

      console.log('TransformParameterObject', transformParameterObject)
      finalResult = result
      finalTransform = transform
      previousTransform = transformParameterObject

      this.model.outputs.set("result", result)
      this.resultOutputDownload.variant = "success"
      this.resultOutputDownload.disabled = false
      const resultDetails = document.getElementById("elastix-result-details")
      resultDetails.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(result, globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
      resultDetails.disabled = false

      this.model.outputs.set("transform", transform)
      this.transformOutputDownload.variant = "success"
      this.transformOutputDownload.disabled = false
      const transformOutput = document.getElementById("elastix-transform-details")
      transformOutput.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(transformParameterObject, globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
      transformOutput.disabled = false
    }
    // const { webWorker, result, transform, transformParameterObject } = await elastix.elastix(this.webWorker,
    //   this.model.inputs.get('parameterObject'),
    //   {
    //     fixed: copyImage(fixed),
    //     moving: copyImage(moving),
    //     transformPath,
    //     initialTransform: previousTransform,
    //   },
    // )
    // this.webWorker = webWorker
    progressBar.setAttribute('style', 'display: none;')

    return { result: finalResult, transform: finalTransform, transformParameterObject: previousTransform }
  }
}

const elastixController = new ElastixController(elastixLoadSampleInputs)
