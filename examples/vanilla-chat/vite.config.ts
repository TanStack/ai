import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      // Proxy API requests to FastAPI server if needed
      // '/api': {
      //   target: 'http://localhost:8080',
      //   changeOrigin: true,
      // }
    }
  }
})


