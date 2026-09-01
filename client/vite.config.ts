import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // One JS chunk + one HTML file makes the standalone inliner trivial and
    // keeps hosting as simple as "put two files anywhere".
    rollupOptions: {
      output: {
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
    chunkSizeWarningLimit: 4000,
  },
  server: {
    port: 5173,
  },
})
