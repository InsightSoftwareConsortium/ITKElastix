// Generated file. To retain edits, remove this comment.

import * as elastix from '../../../dist/bundles/elastix.js'
import readParameterFilesLoadSampleInputs, { usePreRun } from "./read-parameter-files-load-sample-inputs.js"

class ReadParameterFilesModel {

  inputs: Map<string, any>
  options: Map<string, any>
  outputs: Map<string, any>

  constructor() {
    this.inputs = new Map()
    this.options = new Map()
    this.outputs = new Map()
    }
  }


class ReadParameterFilesController  {

  constructor(loadSampleInputs) {
    this.loadSampleInputs = loadSampleInputs

    this.model = new ReadParameterFilesModel()
    const model = this.model

    this.webWorker = null

    if (loadSampleInputs) {
      const loadSampleInputsButton = document.querySelector("#readParameterFilesInputs [name=loadSampleInputs]")
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
    const parameterFilesElement = document.querySelector('#readParameterFilesInputs input[name=parameter-files-file]')
    parameterFilesElement.addEventListener('change', async (event) => {
        const dataTransfer = event.dataTransfer
        const files = event.target.files || dataTransfer.files

        const inputStrings = await Promise.all(Array.from(files).map(async (file) => { const arrayBuffer = await file.arrayBuffer(); return { data: new TextDecoder().decode(new Uint8Array(arrayBuffer)), path: files[0].name } }))
        model.options.set("parameterFiles", inputStrings)
        const details = document.getElementById("readParameterFiles-parameter-files-details")
        details.innerHTML = `<pre>${globalThis.escapeHtml(model.options.get("parameterFiles").map((x) => x.path).toString())}</pre>`
        details.disabled = false
    })

    // ----------------------------------------------
    // Outputs
    const parameterObjectOutputDownload = document.querySelector('#readParameterFilesOutputs sl-button[name=parameter-object-download]')
    parameterObjectOutputDownload.addEventListener('click', async (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (model.outputs.has("parameterObject")) {
            const fileName = `parameterObject.json`
            globalThis.downloadFile(new TextEncoder().encode(JSON.stringify(model.outputs.get("parameterObject"))), fileName)
        }
    })

    const preRun = async () => {
      if (!this.webWorker && loadSampleInputs && usePreRun) {
        await loadSampleInputs(model, true)
        await this.run()
      }
    }

    const onSelectTab = async (event) => {
      if (event.detail.name === 'readParameterFiles-panel') {
        const params = new URLSearchParams(window.location.search)
        if (!params.has('functionName') || params.get('functionName') !== 'readParameterFiles') {
          params.set('functionName', 'readParameterFiles')
          const url = new URL(document.location)
          url.search = params
          window.history.replaceState({ functionName: 'readParameterFiles' }, '', url)
        }
        await preRun()
      }
    }

    const tabGroup = document.querySelector('sl-tab-group')
    tabGroup.addEventListener('sl-tab-show', onSelectTab)
    document.addEventListener('DOMContentLoaded', () => {
      const params = new URLSearchParams(window.location.search)
      if (params.has('functionName') && params.get('functionName') === 'readParameterFiles') {
        preRun()
      }
    })

    const runButton = document.querySelector('#readParameterFilesInputs sl-button[name="run"]')
    runButton.addEventListener('click', async (event) => {
      event.preventDefault()



      try {
        runButton.loading = true

        const t0 = performance.now()
        const { parameterObject, } = await this.run()
        const t1 = performance.now()
        globalThis.notify("readParameterFiles successfully completed", `in ${t1 - t0} milliseconds.`, "success", "rocket-fill")

        model.outputs.set("parameterObject", parameterObject)
        parameterObjectOutputDownload.variant = "success"
        parameterObjectOutputDownload.disabled = false
        const parameterObjectDetails = document.getElementById("readParameterFiles-parameter-object-details")
        parameterObjectDetails.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(parameterObject, globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
        parameterObjectDetails.disabled = false
        const parameterObjectOutput = document.getElementById("readParameterFiles-parameter-object-details")
      } catch (error) {
        globalThis.notify("Error while running pipeline", error.toString(), "danger", "exclamation-octagon")
        throw error
      } finally {
        runButton.loading = false
      }
    })
  }

  async run() {
    const { webWorker, parameterObject, } = await elastix.readParameterFiles(this.webWorker,
      Object.fromEntries(this.model.options.entries())
    )
    this.webWorker = webWorker

    return { parameterObject, }
  }
}

const readParameterFilesController = new ReadParameterFilesController(readParameterFilesLoadSampleInputs)
