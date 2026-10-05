import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "../../playwright-report" }]]
    : "list",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "../../test-results",
  use: { baseURL, trace: "retain-on-failure", locale: "en-US" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // The widget tests embed the loader from a different loopback origin; in production both the
        // customer site and the widget host are public, so Chrome's local-network checks don't apply.
        launchOptions: {
          args: [
            "--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights",
          ],
        },
      },
    },
  ],
  webServer: {
    command: process.env.E2E_START_COMMAND ?? "pnpm dev",
    url: `${baseURL}/healthz`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
