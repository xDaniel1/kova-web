import { defineConfig, devices } from '@playwright/test'

// Smoke test against the production build, the same files GitHub Pages serves.
// `npm run e2e` runs Chrome only (what the deploy gate uses); `npm run e2e:all` adds
// Firefox, Safari (WebKit) and tablet and phone sizes.
const all = !!process.env.E2E_ALL

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI || all ? 1 : 0,
  use: { baseURL: 'http://localhost:4173', permissions: [], serviceWorkers: 'block' },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'] } },
    ...(all
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'safari', use: { ...devices['Desktop Safari'] } },
          { name: 'tablet', use: { ...devices['iPad (gen 7)'] } },
          { name: 'phone-safari', use: { ...devices['iPhone 14'] } },
          { name: 'phone-chrome', use: { ...devices['Pixel 7'] } },
        ]
      : []),
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
