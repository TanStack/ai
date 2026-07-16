import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [nitroV2Plugin(), tailwindcss(), tanstackStart(), viteReact()],
})

export default config
