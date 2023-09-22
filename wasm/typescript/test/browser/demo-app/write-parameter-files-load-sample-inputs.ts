export default async function writeParameterFilesLoadSampleInputs (model, preRun=false) {
  const dataUrl = 'https://w3s.link/ipfs/bafybeifq7m3mb4m3mgbhft2vqejjgwxx4azmmzuxwf5cubajpyaf4hq2gq/data/input'

  const parameterObjectButton = document.querySelector("#writeParameterFilesInputs [name=parameter-object-file-button]")
  if (!preRun) {
    parameterObjectButton.loading = true
  }
  const parameterObjectFile = 'parameters_multiple.json'
  const parameterObjectResponse = await fetch(`${dataUrl}/${parameterObjectFile}`)
  const parameterObject = await parameterObjectResponse.json()
  console.log(parameterObject)
  model.inputs.set("parameterObject", parameterObject)

  const parameterObjectElement = document.getElementById('writeParameterFiles-parameter-object-details')
  if (!preRun) {
    parameterObjectElement.innerHTML = `<pre>${globalThis.escapeHtml(JSON.stringify(parameterObject), globalThis.interfaceTypeJsonReplacer, 2)}</pre>`
    parameterObjectElement.disabled = false
    parameterObjectButton.loading = false
  }

  return model
}

export const usePreRun = true
