import { demoServer } from './common.ts'

describe('defaultParameterMap', () => {
  beforeEach(function() {
    cy.visit(demoServer)

    const testPathPrefix = '../test/data/input/'

    const testImageFiles = [
      'cake_easy.iwi.cbor',
      'cake_hard.iwi.cbor',
      'cake_easy.png',
      'cake_hard.png',
      'apple.jpg',
      'orange.jpg',
    ]
    testImageFiles.forEach((fileName) => {
      cy.readFile(`${testPathPrefix}${fileName}`, null).as(fileName)
    })
  })

  it('Runs on double images', function () {
    cy.get('sl-tab[panel="compareImages-panel"]').click()

    const testFile = { contents: new Uint8Array(this['cake_easy.iwi.cbor']), fileName: 'cake_easy.iwi.cbor' }
    cy.get('#compareImagesInputs input[name="test-image-file"]').selectFile([testFile,], { force: true })
    cy.get('#compareImages-test-image-details').should('contain', 'imageType')

    const baselineFile = { contents: new Uint8Array(this['cake_hard.iwi.cbor']), fileName: 'cake_hard.iwi.cbor' }
    cy.get('#compareImagesInputs input[name="baseline-images-file"]').selectFile([baselineFile,], { force: true })
    cy.get('#compareImages-baseline-images-details').should('contain', 'imageType')

    cy.get('#compareImagesInputs sl-button[name="run"]').click()

    cy.get('#compareImages-metrics-details').should('contain', '"almostEqual": false')
  })

  it('Runs on uint8 images', function () {
    cy.get('sl-tab[panel="compareImages-panel"]').click()

    const testFile = { contents: new Uint8Array(this['cake_easy.png']), fileName: 'cake_easy.png' }
    cy.get('#compareImagesInputs input[name="test-image-file"]').selectFile([testFile,], { force: true })
    cy.get('#compareImages-test-image-details').should('contain', 'imageType')

    const baselineFile = { contents: new Uint8Array(this['cake_hard.png']), fileName: 'cake_hard.png' }
    cy.get('#compareImagesInputs input[name="baseline-images-file"]').selectFile([baselineFile,], { force: true })
    cy.get('#compareImages-baseline-images-details').should('contain', 'imageType')

    cy.get('#compareImagesInputs sl-button[name="run"]').click()

    cy.get('#compareImages-metrics-details').should('contain', '"almostEqual": false')
  })

  it('Runs on RGB images', function () {
    cy.get('sl-tab[panel="compareImages-panel"]').click()

    const testFile = { contents: new Uint8Array(this['apple.jpg']), fileName: 'apple.jpg' }
    cy.get('#compareImagesInputs input[name="test-image-file"]').selectFile([testFile,], { force: true })
    cy.get('#compareImages-test-image-details').should('contain', 'imageType')

    const baselineFile = { contents: new Uint8Array(this['orange.jpg']), fileName: 'orange.jpg' }
    cy.get('#compareImagesInputs input[name="baseline-images-file"]').selectFile([baselineFile,], { force: true })
    cy.get('#compareImages-baseline-images-details').should('contain', 'imageType')

    cy.get('#compareImagesInputs sl-button[name="run"]').click()

    cy.get('#compareImages-metrics-details').should('contain', '"almostEqual": false')
  })
})
