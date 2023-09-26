import { readImageArrayBuffer } from "itk-wasm"

export default async function elastixLoadSampleInputs (model, preRun=false) {
  const dataUrl = 'https://w3s.link/ipfs/bafybeifq7m3mb4m3mgbhft2vqejjgwxx4azmmzuxwf5cubajpyaf4hq2gq/data/input'

  // const parameterObjectButton = document.querySelector("#elastixInputs [name=parameter-object-file-button]")
  // if (!preRun) {
  //   parameterObjectButton.loading = true
  // }
  // const parameterObjectFile = 'parameters_multiple.json'
  // const parameterObjectResponse = await fetch(`${dataUrl}/${parameterObjectFile}`)
  // const parameterObject = await parameterObjectResponse.json()
  // model.inputs.set("parameterObject", parameterObject)

  // const parameterObjectElement = document.getElementById('elastix-parameter-object-details')
  // if (!preRun) {
  //   parameterObjectElement.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(parameterObject), globalThis.interfaceTypeJsonReplacer, 2)}</pre>`
  //   parameterObjectElement.disabled = false
  //   parameterObjectButton.loading = false
  // }

  const fixedButton = document.querySelector('#elastixInputs sl-button[name=fixed-file-button]')
  if (!preRun) {
    fixedButton.loading = true
  }
  const fixedFileName = 'CT_2D_head_fixed.mha'
  const urlPrefix = 'https://bafybeiclckkwabcpcgh3yo5fun2omc6jiloe3x43p6cvj4ctsyxiuwo6c4.ipfs.w3s.link/ipfs/bafybeiclckkwabcpcgh3yo5fun2omc6jiloe3x43p6cvj4ctsyxiuwo6c4/data/input/'
  const fixedReponse = await fetch(`${urlPrefix}${fixedFileName}`)
  const fixedData = new Uint8Array(await fixedReponse.arrayBuffer())
  const { webWorker, image: fixedImage } = await readImageArrayBuffer(null, fixedData.buffer, fixedFileName)
  model.options.set('fixed', fixedImage)
  if (!preRun) {
    const fixedElement = document.querySelector('#elastix-fixed-details')
    fixedElement.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(fixedImage, globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
    fixedElement.disabled = false
    fixedButton.loading = false
  }

  const movingButton = document.querySelector('#elastixInputs sl-button[name=moving-file-button]')
  if (!preRun) {
    movingButton.loading = true
  }
  const movingFileName = 'CT_2D_head_moving.mha'
  const movingReponse = await fetch(`${urlPrefix}${movingFileName}`)
  const movingData = new Uint8Array(await movingReponse.arrayBuffer())
  const { image: movingImage } = await readImageArrayBuffer(webWorker, movingData.buffer, movingFileName)
  webWorker.terminate()
  model.options.set('moving', movingImage)

  if (!preRun) {
    const movingElement = document.querySelector('#elastix-moving-details')
    movingElement.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(movingImage, globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
    movingElement.disabled = false
    movingButton.loading = false
  }

  // const transformFile = 'transform.h5'
  // model.options.set("transformPath", transformFile)
  // if (!preRun) {
  //   const transformElement = document.querySelector('#elastixInputs sl-input[name=transform]')
  //   transformElement.value = transformFile
  // }

  return model
}

export const usePreRun = true