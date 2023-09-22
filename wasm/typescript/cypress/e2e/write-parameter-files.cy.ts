import { demoServer } from './common.ts'

describe('writeParameterFiles', () => {
  beforeEach(function() {
    cy.visit(demoServer)

    const testPathPrefix = '../test/data/input/'

    const testParameterFiles = [
      'parameters_multiple.json',
    ]
    testParameterFiles.forEach((fileName) => {
      cy.readFile(`${testPathPrefix}${fileName}`, null).as(fileName)
    })
  })

  it('Write parameter files from a parameter object representation', function () {
    cy.get('sl-tab[panel="writeParameterFiles-panel"]').click()

    const parametersFile = { contents: new Uint8Array(this['parameters_multiple.json']), fileName: 'parameters_multiple.json' }
    cy.get('#writeParameterFilesInputs input[name="parameter-object-file"]').selectFile([parametersFile,], { force: true })
    cy.get('#writeParameterFiles-parameter-object-details').should('contain', '"AutomaticScalesEstimation"')

    cy.get('#writeParameterFilesInputs sl-button[name="run"]').click()

    cy.get('#writeParameterFiles-parameter-files-details').should('contain', '"AutomaticScalesEstimation"')
  })
})
