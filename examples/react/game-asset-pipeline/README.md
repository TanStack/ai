# Game Asset Pipeline

You want a game-ready 3D model from one line of text, and a second skin for the same mesh. This app runs 4 fal steps, and you check the result of each step before you pay for the next one:

1. Concept art from your text (`fal-ai/flux-2`), or an image that you upload.
2. A low-poly mesh with quad faces and PBR textures (Meshy v6).
3. A new skin for the same object (`fal-ai/flux-2/edit`).
4. The mesh from step 2, painted with the new skin (TRELLIS-2 Retexture).

## Run it

1. From the repo root, run `pnpm install`.
2. Run `pnpm --filter game-asset-pipeline dev`.
3. Open http://localhost:3100.
4. Paste a fal key from https://fal.ai/dashboard/keys.
5. Click each step in order. Each 3D step takes a few minutes.

The key stays in this tab only. A reload clears it. fal bills each step.

The server routes are `src/routes/api.concept.ts` and `src/routes/api.model3d.ts`. The UI is `src/routes/index.tsx`.
