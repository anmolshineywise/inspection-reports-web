import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy /vessel/:imo -> external VMS API (bypass CORS during development)
      '^/vessel/.*': {
        target: 'https://vms-data-processing-jgjm9r.5sc6y6-4.usa-e2.cloudhub.io',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/vessel/, '/api/vessel')
      }
    }
  }
})