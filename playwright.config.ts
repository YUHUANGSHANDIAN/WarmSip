import { defineConfig, devices } from "@playwright/test";

process.env.TEST_OUTPUT_DIR ??= `test-results/run-${Date.now()}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  timeout: 60000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  outputDir: process.env.TEST_OUTPUT_DIR,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:1421",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
});
