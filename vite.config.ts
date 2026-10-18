import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Charts (recharts + its d3/redux deps) are only needed by lazily-loaded chart components,
        // so they get one shared, cacheable chunk that never blocks the first paint. Framework code
        // that every page needs sits in a long-lived 'vendor' chunk.
        codeSplitting: {
          groups: [
            {
              name: 'charts',
              test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap|@reduxjs|redux|react-redux|reselect|immer|es-toolkit|decimal\.js-light|eventemitter3|tiny-invariant|use-sync-external-store)[\\/]/,
              priority: 20,
              includeDependenciesRecursively: false,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
              priority: 10,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  server: {
    // Must stay 127.0.0.1:3000 to match the redirect_uri registered with iRacing's
    // OAuth client ("http://127.0.0.1:3000/api/auth/callback/iracing") — 127.0.0.1 and
    // localhost are different origins for this purpose, so this can't just be "localhost".
    host: '127.0.0.1',
    port: 3000,
  },
})
