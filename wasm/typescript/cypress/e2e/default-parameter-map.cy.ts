import { demoServer } from './common.ts'

describe('defaultParameterMap', () => {
  beforeEach(function() {
    cy.visit(demoServer)
  })

  it('Provides the affine default parameter map', function () {
    cy.get('sl-tab[panel="defaultParameterMap-panel"]').click()

    cy.get('#defaultParameterMapInputs sl-button[name="loadSampleInputs"]').click()
    cy.get('#defaultParameterMapInputs sl-button[name="run"]').click()

    cy.get('#defaultParameterMap-parameter-object-details').should('contain', '"AutomaticParameterEstimation"')
  })
})
