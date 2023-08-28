import { readImageArrayBuffer } from "itk-wasm"

export default async function elastixLoadSampleInputs (model) {
  const fixedButton = document.querySelector('#elastixInputs sl-button[name=fixed-file-button]')
  fixedButton.loading = true
  const fixedFileName = 'CT_2D_head_fixed.mha'
  const urlPrefix = 'https://bafybeiclckkwabcpcgh3yo5fun2omc6jiloe3x43p6cvj4ctsyxiuwo6c4.ipfs.w3s.link/ipfs/bafybeiclckkwabcpcgh3yo5fun2omc6jiloe3x43p6cvj4ctsyxiuwo6c4/data/input/'
  const fixedReponse = await fetch(`${urlPrefix}${fixedFileName}`)
  const fixedData = new Uint8Array(await fixedReponse.arrayBuffer())
  const { webWorker, image: fixedImage } = await readImageArrayBuffer(null, fixedData.buffer, fixedFileName)
  model.options.set('fixed', fixedImage)
  const fixedElement = document.querySelector('#elastix-fixed-details')
  fixedElement.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(fixedImage, globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
  fixedElement.disabled = false
  fixedButton.loading = false

  const movingButton = document.querySelector('#elastixInputs sl-button[name=moving-file-button]')
  movingButton.loading = true
  const movingFileName = 'CT_2D_head_moving.mha'
  const movingReponse = await fetch(`${urlPrefix}${movingFileName}`)
  const movingData = new Uint8Array(await movingReponse.arrayBuffer())
  const { image: movingImage } = await readImageArrayBuffer(webWorker, movingData.buffer, movingFileName)
  webWorker.terminate()
  model.options.set('moving', movingImage)
  const movingElement = document.querySelector('#elastix-moving-details')
  movingElement.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(movingImage, globalThis.interfaceTypeJsonReplacer, 2))}</pre>`
  movingElement.disabled = false
  movingButton.loading = false

  return model
}
