import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backendProxies = [
  { id: 'go', port: 8001 },
  { id: 'rust', port: 8002 },
  { id: 'php', port: 8003 },
  { id: 'zig', port: 8004 },
  { id: 'bash', port: 8005 },
  { id: 'python', port: 8006 },
] as const

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: Object.fromEntries(
      backendProxies.map(({ id, port }) => [
        `/api/${id}`,
        {
          target: `http://127.0.0.1:${port}`,
          changeOrigin: true,
          rewrite: (path) =>
            path.replace(new RegExp(`^/api/${id}/?$`), '/') || '/',
        },
      ]),
    ),
  },
})
