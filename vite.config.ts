/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from the root of app.kovamaps.com (custom domain), so base stays "/".
export default defineConfig({
  plugins: [react()],
  base: '/',
  test: {
    // Unit tests live next to the code; e2e/ is Playwright's and must not run under Vitest.
    include: ['src/**/*.test.ts'],
  },
})
