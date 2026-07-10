import { defineConfig, devices } from "@playwright/test";

const chromiumPath = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const useSystemChromium = process.env.PW_SYSTEM_CHROMIUM === "1";
const launchOptions = useSystemChromium ? { executablePath: chromiumPath } : {};

const apiEnv = {
  ...process.env,
  NODE_ENV: "development",
  PORT: "4000",
  DATABASE_URL: process.env.E2E_DATABASE_URL || "postgres://postgres@127.0.0.1:5433/payment_portal",
  REDIS_URL: process.env.E2E_REDIS_URL || "redis://127.0.0.1:6379",
  PUBLIC_BASE_URL: "http://127.0.0.1:3000",
  API_PUBLIC_BASE_URL: "http://127.0.0.1:4000",
  // Providers stay in mock mode: no keys configured.
  NOWPAYMENTS_API_KEY: "",
  NOWPAYMENTS_IPN_SECRET: "",
  JFA_GO_USERNAME: "",
  JFA_GO_PASSWORD: "",
  SHOP_NAME: "Byteflix"
};

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    launchOptions
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, launchOptions } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions } }
  ],
  webServer: [
    {
      command: "npm --workspace api run dev",
      cwd: "..",
      port: 4000,
      reuseExistingServer: true,
      timeout: 60_000,
      env: apiEnv
    },
    {
      command: "npm --workspace web run dev",
      cwd: "..",
      port: 3000,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        API_URL: "http://127.0.0.1:4000",
        NEXT_PUBLIC_SHOP_NAME: "Byteflix"
      }
    }
  ]
});
