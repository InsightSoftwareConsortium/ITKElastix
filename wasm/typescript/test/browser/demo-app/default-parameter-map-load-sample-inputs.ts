export default async function defaultParameterMapLoadSampleInputs (model, preRun=false) {
  const transformName = "affine"
  model.inputs.set("transformName", transformName)
  if (!preRun) {
    const transformNameElement = document.querySelector("#defaultParameterMapInputs [name=transform-name]")
    transformNameElement.value = transformName
  }

  return model
}

export const usePreRun = true
