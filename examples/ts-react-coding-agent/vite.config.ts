import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'

const config = defineConfig({
  // The Claude Agent SDK is server-only and ships its own bundled Claude
  // Code runtime — keep it external so the SSR build resolves it at runtime
  // via require() instead of inlining it into the rollup chunk.
  ssr: {
    external: ['@anthropic-ai/claude-agent-sdk'],
  },
  plugins: [
    nitroV2Plugin({
      externals: {
        external: ['@anthropic-ai/claude-agent-sdk'],
      },
    }),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
