import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  worker: {
    format: 'es',
  },
  base: './',
  build: {
    outDir: 'dist-react'
  },
  server: {
    port: 5123,
    strictPort: true,
  }
})
