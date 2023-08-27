// Generated file. To retain edits, remove this comment.

import { readImageFile, copyImage } from 'itk-wasm'
import { writeImageArrayBuffer, copyImage } from 'itk-wasm'
import * as elastix from '../../../dist/bundles/elastix.js'
import elastixLoadSampleInputs from "./elastix-load-sample-inputs.js"

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

    // ----------------------------------------------
    // Inputs
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

    // ----------------------------------------------
    // Outputs
    const resultOutputDownload = document.querySelector('#elastixOutputs sl-button[name=result-download]')
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

    const runButton = document.querySelector('#elastixInputs sl-button[name="run"]')
    runButton.addEventListener('click', async (event) => {
      event.preventDefault()



      try {
        runButton.loading = true
        const t0 = performance.now()

        const { webWorker, result, } = await elastix.elastix(this.webWorker,
          Object.fromEntries(model.options.entries())
        )

        const t1 = performance.now()
        globalThis.notify("elastix successfully completed", `in ${t1 - t0} milliseconds.`, "success", "rocket-fill")
        this.webWorker = webWorker

        model.outputs.set("result", result)
        resultOutputDownload.variant = "success"
        resultOutputDownload.disabled = false
        const resultDetails = document.getElementById("elastix-result-details")
        resultDetails.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(result, globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
        resultDetails.disabled = false
        const resultOutput = document.getElementById('elastix-result-details')
      } catch (error) {
        globalThis.notify("Error while running pipeline", error.toString(), "danger", "exclamation-octagon")
        throw error
      } finally {
        runButton.loading = false
      }
    })
  }
}

const elastixController = new ElastixController(elastixLoadSampleInputs)
