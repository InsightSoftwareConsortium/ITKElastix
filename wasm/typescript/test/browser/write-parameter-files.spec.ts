import { test, expect } from "@playwright/test";

test.describe("writeParameterFiles", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Write parameter files from a parameter object representation", async ({
    page,
  }) => {
    // Click on the write parameter files tab
    await page.click('sl-tab[panel="writeParameterFiles-panel"]');

    // Wait for the tab content to be loaded
    await expect(page.locator("#writeParameterFilesInputs")).toBeVisible();

    // Click load sample inputs button
    await page.click(
      '#writeParameterFilesInputs sl-button[name="loadSampleInputs"]'
    );

    // Verify the parameter object is loaded with timeout
    await expect(
      page.locator("#writeParameterFiles-parameter-object-details")
    ).toContainText('"AutomaticScalesEstimation"', { timeout: 10000 });

    // Check that parameter files input contains expected value
    const parameterFilesInput = page.locator(
      '#writeParameterFilesInputs sl-input[name="parameter-files"] input'
    );
    await expect(parameterFilesInput).toHaveValue(/translation/);

    // Click run button
    await page.click('#writeParameterFilesInputs sl-button[name="run"]');

    // Check that the result contains the expected parameter with timeout
    await expect(
      page.locator("#writeParameterFiles-parameter-files-details")
    ).toContainText("AutomaticScalesEstimation", { timeout: 10000 });
  });

  test("Write TOML parameter files from a parameter object representation", async ({
    page,
  }) => {
    // Click on the write parameter files tab
    await page.click('sl-tab[panel="writeParameterFiles-panel"]');

    // Wait for the tab content to be loaded
    await expect(page.locator("#writeParameterFilesInputs")).toBeVisible();

    // Click load sample inputs button
    await page.click(
      '#writeParameterFilesInputs sl-button[name="loadSampleInputs"]'
    );

    // Verify the parameter object is loaded with timeout
    await expect(
      page.locator("#writeParameterFiles-parameter-object-details")
    ).toContainText('"AutomaticScalesEstimation"', { timeout: 10000 });

    // Request TOML output files. The .toml extension selects the TOML format.
    const parameterFilesInput = page.locator(
      '#writeParameterFilesInputs sl-input[name="parameter-files"] input'
    );
    await expect(parameterFilesInput).toHaveValue(/translation/);
    await parameterFilesInput.fill(
      "translation_parameters.toml, affine_parameters.toml"
    );
    await parameterFilesInput.dispatchEvent("change");

    // Click run button
    await page.click('#writeParameterFilesInputs sl-button[name="run"]');

    // Check that the result contains the TOML files with timeout
    const parameterFilesDetails = page.locator(
      "#writeParameterFiles-parameter-files-details"
    );
    await expect(parameterFilesDetails).toContainText(
      "translation_parameters.toml",
      { timeout: 10000 }
    );
    await expect(parameterFilesDetails).toContainText(
      "AutomaticScalesEstimation = true"
    );
    await expect(parameterFilesDetails).toContainText(
      "NumberOfResolutions = 4"
    );
    await expect(parameterFilesDetails).toContainText(
      "affine_parameters.toml"
    );
  });
});
