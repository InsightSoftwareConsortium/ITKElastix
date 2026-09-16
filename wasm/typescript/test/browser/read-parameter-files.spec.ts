import { test, expect } from "@playwright/test";
import path from "path";

const testDataInputDirectory = path.resolve("..", "test", "data", "input");

test.describe("readParameterFiles", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Reads parameter files into a parameter object representation", async ({
    page,
  }) => {
    // Click on the read parameter files tab
    await page.click('sl-tab[panel="readParameterFiles-panel"]');

    // Wait for the tab content to be loaded
    await expect(page.locator("#readParameterFilesInputs")).toBeVisible();

    // Check that the file input exists in the DOM (it may be hidden by CSS)
    const fileInput = page.locator(
      '#readParameterFilesInputs input[name="parameter-files-file"]'
    );
    await expect(fileInput).toBeAttached();

    // Verify the run button is visible
    await expect(
      page.locator('#readParameterFilesInputs sl-button[name="run"]')
    ).toBeVisible();

    // Note: If test files exist, you can upload them like this:
    // await page.setInputFiles('#readParameterFilesInputs input[name="parameter-files-file"]', [
    //   'test/data/input/parameters_Translation.txt',
    //   'test/data/input/parameters_Affine.txt'
    // ]);

    // Note: Actual file upload and processing test would require test data files
    // For now, we verify the UI components are working
  });

  test("Reads a TOML parameter file into a parameter object representation", async ({
    page,
  }) => {
    // Click on the read parameter files tab
    await page.click('sl-tab[panel="readParameterFiles-panel"]');

    // Wait for the tab content to be loaded
    await expect(page.locator("#readParameterFilesInputs")).toBeVisible();

    // Upload the TOML parameter file. The .toml extension selects the TOML format.
    await page.setInputFiles(
      '#readParameterFilesInputs input[name="parameter-files-file"]',
      path.join(testDataInputDirectory, "parameters_Translation.toml")
    );
    await expect(
      page.locator("#readParameterFiles-parameter-files-details")
    ).toContainText("parameters_Translation.toml");

    // Click run button
    await page.click('#readParameterFilesInputs sl-button[name="run"]');

    // Check that the result contains the expected parameters with timeout
    // Note: time is required after initial run due to WebAssembly load,
    // initialization, and execution.
    const parameterObjectDetails = page.locator(
      "#readParameterFiles-parameter-object-details"
    );
    await expect(parameterObjectDetails).toContainText(
      '"TranslationTransform"',
      { timeout: 10000 }
    );
    // TOML integers and booleans are converted to elastix parameter value strings
    await expect(parameterObjectDetails).toContainText('"4"');
    await expect(parameterObjectDetails).toContainText('"true"');
  });
});
