import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from the root of app.kovamaps.com (custom domain), so base stays "/".
export default defineConfig({
  plugins: [react()],
  base: '/',
})
