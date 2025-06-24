import { test, expect } from "@playwright/test";
import { demoServer } from "./common";

test.describe("defaultParameterMap", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(demoServer);
  });

  test("Provides the affine default parameter map", async ({ page }) => {
    // Click on the default parameter map tab
    await page.click('sl-tab[panel="defaultParameterMap-panel"]');

    // Wait for the tab content to be loaded
    await expect(page.locator("#defaultParameterMapInputs")).toBeVisible();

    // Click load sample inputs button
    await page.click(
      '#defaultParameterMapInputs sl-button[name="loadSampleInputs"]'
    );

    // Click run button
    await page.click('#defaultParameterMapInputs sl-button[name="run"]');

    // Check that the result contains the expected parameter with a timeout
    await expect(
      page.locator("#defaultParameterMap-parameter-map-details")
    ).toContainText('"AutomaticParameterEstimation"', { timeout: 10000 });
  });
});
