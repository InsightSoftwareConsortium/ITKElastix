import version from 'itk-wasm'

const itkConfig = {
  // Use the worker bundled by vite or webpack
  pipelineWorkerUrl: null,
  imageIOUrl: `https://cdn.jsdelivr.net/npm/itk-image-io@${version}`,
  meshIOUrl: `https://cdn.jsdelivr.net/npm/itk-mesh-io@${version}`,
  pipelinesUrl: '/pipelines'
}

export default itkConfig
