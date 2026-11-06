import adapter from '@sveltejs/adapter-auto'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      preprocess: vitePreprocess(),
      // adapter-auto only supports some environments. See
      // https://svelte.dev/docs/kit/adapters to pick a specific one.
      adapter: adapter(),
    }),
  ],
})
