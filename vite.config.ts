/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

// Served from the root of app.kovamaps.com (custom domain), so base stays "/".
export default defineConfig({
  plugins: [react()],
  base: '/',
  // Shared Kova version (package.json), CI run number as the build, and the commit.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(process.env.GITHUB_RUN_NUMBER ?? 'dev'),
    __APP_COMMIT__: JSON.stringify(commit()),
    // Tower counts only production and beta. Only the deploy-on-main build sets production; any other CI run is test, local is dev.
    __APP_CHANNEL__: JSON.stringify(process.env.VITE_CHANNEL ?? (process.env.GITHUB_RUN_NUMBER ? 'test' : 'dev')),
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: an app change doesn't make returning visitors re-download Mapbox.
        manualChunks(id) {
          if (id.includes('node_modules/mapbox-gl')) return 'mapbox'
          if (id.includes('node_modules/@supabase')) return 'supabase'
          if (id.includes('node_modules/react')) return 'react'
        },
      },
    },
  },
  test: {
    // Unit tests live next to the code; e2e/ is Playwright's and must not run under Vitest.
    include: ['src/**/*.test.ts'],
  },
})
