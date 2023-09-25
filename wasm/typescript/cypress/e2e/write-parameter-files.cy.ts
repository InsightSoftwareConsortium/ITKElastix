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

    cy.get('#writeParameterFilesInputs sl-button[name="loadSampleInputs"]').click()
    cy.get('#writeParameterFiles-parameter-object-details').should('contain', '"AutomaticScalesEstimation"')
    // cy.get returns a jquery object -- invoke to get the underlying element
    cy.get('#writeParameterFilesInputs [name="parameter-files"]').invoke('get', '0').its('value').should('contain', 'translation')

    cy.get('#writeParameterFilesInputs sl-button[name="run"]').click()

    cy.get('#writeParameterFiles-parameter-files-details').should('contain', 'AutomaticScalesEstimation')
  })
})
