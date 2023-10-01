import { demoServer } from './common.ts'

describe('readParameterFiles', () => {
  beforeEach(function() {
    cy.visit(demoServer)

    const testPathPrefix = '../test/data/input/'

    const testParameterFiles = [
      'parameters_Translation.txt',
      'parameters_Affine.txt',
    ]
    testParameterFiles.forEach((fileName) => {
      cy.readFile(`${testPathPrefix}${fileName}`, null).as(fileName)
    })
  })

  it('Reads parameter files into a parameter object representation', function () {
    cy.get('sl-tab[panel="readParameterFiles-panel"]').click()

    const translationFile = { contents: new Uint8Array(this['parameters_Translation.txt']), fileName: 'parameters_Translation.txt' }
    const affineFile = { contents: new Uint8Array(this['parameters_Affine.txt']), fileName: 'parameters_Affine.txt' }
    cy.get('#readParameterFilesInputs input[name="parameter-files-file"]').selectFile([translationFile, affineFile,], { force: true })
    cy.get('#readParameterFiles-parameter-files-details').should('contain', 'parameters_')

    cy.get('#readParameterFilesInputs sl-button[name="run"]').click()

    cy.get('#readParameterFiles-parameter-object-details').should('contain', '"AutomaticScalesEstimation"')
  })
})
