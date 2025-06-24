import { test, expect } from "@playwright/test";
import { demoServer } from "./common";

test.describe("writeParameterFiles", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(demoServer);
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
});
