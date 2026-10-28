# Generate Image

You want an image from a text prompt. Paste an OpenRouter key, type a prompt, and generate.

## Run it

1. From the repo root, run `pnpm install`.
2. Run `pnpm --filter generate-image dev`.
3. Open http://localhost:3100.
4. Paste an OpenRouter key from https://openrouter.ai/keys.
5. Type a prompt and click Generate.

The key stays in this tab only. A reload clears it.

The server route is `src/routes/api.generate.image.ts`. The UI is `src/routes/index.tsx`.
