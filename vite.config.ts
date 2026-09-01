import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Must stay 127.0.0.1:3000 to match the redirect_uri registered with iRacing's
    // OAuth client ("http://127.0.0.1:3000/api/auth/callback/iracing") — 127.0.0.1 and
    // localhost are different origins for this purpose, so this can't just be "localhost".
    host: '127.0.0.1',
    port: 3000,
  },
})
