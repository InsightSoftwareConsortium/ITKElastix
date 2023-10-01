export default async function readParameterFilesLoadSampleInputs (model, preRun=false) {
  const dataUrl = 'https://w3s.link/ipfs/bafybeifq7m3mb4m3mgbhft2vqejjgwxx4azmmzuxwf5cubajpyaf4hq2gq/data/input'

  const parameterFilesButton = document.querySelector("#readParameterFilesInputs [name=parameter-files-file-button]")
  if (!preRun) {
    parameterFilesButton.loading = true
  }
  const translationFileName = 'parameters_Translation.txt'
  const translationFileResponse = await fetch(`${dataUrl}/${translationFileName}`)
  const translationFileContent = await translationFileResponse.text()
  const affineFileName = 'parameters_Affine.txt'
  const affineFileResponse = await fetch(`${dataUrl}/${affineFileName}`)
  const affineFileContent = await affineFileResponse.text()
  const parameterFiles = [{ path: translationFileName, data: translationFileContent }, { path: affineFileName, data: affineFileContent }]
  model.options.set("parameterFiles", parameterFiles)

  const parameterFilesElement = document.getElementById('readParameterFiles-parameter-files-details')
  if (!preRun) {
    parameterFilesElement.innerHTML = `<pre>[${translationFileName}, ${affineFileName}]</pre>`
    parameterFilesElement.disabled = false
    parameterFilesButton.loading = false
  }

  return model
}

// Use this function to run the pipeline when this tab group is select.
// This will load the web worker if it is not already loaded, download the wasm module, and allocate memory in the wasm model.
// Set this to `false` if sample inputs are very large or sample pipeline computation is long.
export const usePreRun = true
