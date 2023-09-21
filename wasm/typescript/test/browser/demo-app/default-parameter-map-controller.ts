// Generated file. To retain edits, remove this comment.

import * as elastix from '../../../dist/bundles/elastix.js'
import defaultParameterMapLoadSampleInputs, { usePreRun } from "./default-parameter-map-load-sample-inputs.js"

class DefaultParameterMapModel {

  inputs: Map<string, any>
  options: Map<string, any>
  outputs: Map<string, any>

  constructor() {
    this.inputs = new Map()
    this.options = new Map()
    this.outputs = new Map()
    }
  }


class DefaultParameterMapController  {

  constructor(loadSampleInputs) {
    this.loadSampleInputs = loadSampleInputs

    this.model = new DefaultParameterMapModel()
    const model = this.model

    this.webWorker = null

    if (loadSampleInputs) {
      const loadSampleInputsButton = document.querySelector("#defaultParameterMapInputs [name=loadSampleInputs]")
      loadSampleInputsButton.setAttribute('style', 'display: block-inline;')
      loadSampleInputsButton.addEventListener('click', async (event) => {
        loadSampleInputsButton.loading = true
        await loadSampleInputs(model)
        loadSampleInputsButton.loading = false
      })
    }

    // ----------------------------------------------
    // Inputs
    const transformNameElement = document.querySelector('#defaultParameterMapInputs sl-input[name=transform-name]')
    transformNameElement.addEventListener('sl-change', (event) => {
        model.inputs.set("transformName", transformNameElement.value)
    })

    // ----------------------------------------------
    // Options
    const numberOfResolutionsElement = document.querySelector('#defaultParameterMapInputs sl-input[name=number-of-resolutions]')
    numberOfResolutionsElement.addEventListener('sl-change', (event) => {
        model.options.set("numberOfResolutions", parseInt(numberOfResolutionsElement.value))
    })

    const finalGridSpacingElement = document.querySelector('#defaultParameterMapInputs sl-input[name=final-grid-spacing]')
    finalGridSpacingElement.addEventListener('sl-change', (event) => {
        model.options.set("finalGridSpacing", parseFloat(finalGridSpacingElement.value))
    })

    // ----------------------------------------------
    // Outputs
    const parameterMapOutputDownload = document.querySelector('#defaultParameterMapOutputs sl-button[name=parameter-map-download]')
    parameterMapOutputDownload.addEventListener('click', async (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (model.outputs.has("parameterMap")) {
            const fileName = `parameterMap.json`
            globalThis.downloadFile(new TextEncoder().encode(JSON.stringify(model.outputs.get("parameterMap"))), fileName)
        }
    })

    const tabGroup = document.querySelector('sl-tab-group')
    tabGroup.addEventListener('sl-tab-show', async (event) => {
      if (event.detail.name === 'defaultParameterMap-panel') {
        const params = new URLSearchParams(window.location.search)
        if (!params.has('functionName') || params.get('functionName') !== 'defaultParameterMap') {
          params.set('functionName', 'defaultParameterMap')
          const url = new URL(document.location)
          url.search = params
          window.history.replaceState({ functionName: 'defaultParameterMap' }, '', url)
        }
        if (!this.webWorker && loadSampleInputs && usePreRun) {
          await loadSampleInputs(model, true)
          await this.run()
        }
      }
    })

    const runButton = document.querySelector('#defaultParameterMapInputs sl-button[name="run"]')
    runButton.addEventListener('click', async (event) => {
      event.preventDefault()

      if(!model.inputs.has('transformName')) {
        globalThis.notify("Required input not provided", "transformName", "danger", "exclamation-octagon")
        return
      }


      try {
        runButton.loading = true

        const t0 = performance.now()
        const { parameterMap, } = await this.run()
        const t1 = performance.now()
        globalThis.notify("defaultParameterMap successfully completed", `in ${t1 - t0} milliseconds.`, "success", "rocket-fill")

        model.outputs.set("parameterMap", parameterMap)
        parameterMapOutputDownload.variant = "success"
        parameterMapOutputDownload.disabled = false
        const parameterMapDetails = document.getElementById("defaultParameterMap-parameter-map-details")
        parameterMapDetails.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(parameterMap, globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
        parameterMapDetails.disabled = false
        const parameterMapOutput = document.getElementById("defaultParameterMap-parameter-map-details")
      } catch (error) {
        globalThis.notify("Error while running pipeline", error.toString(), "danger", "exclamation-octagon")
        throw error
      } finally {
        runButton.loading = false
      }
    })
  }

  async run() {
    const { webWorker, parameterMap, } = await elastix.defaultParameterMap(this.webWorker,
      this.model.inputs.get('transformName'),
      Object.fromEntries(this.model.options.entries())
    )
    this.webWorker = webWorker

    return { parameterMap, }
  }
}

const defaultParameterMapController = new DefaultParameterMapController(defaultParameterMapLoadSampleInputs)
