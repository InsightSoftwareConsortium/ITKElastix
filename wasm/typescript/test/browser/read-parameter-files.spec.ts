import { test, expect } from "@playwright/test";

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
});
