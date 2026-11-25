# Game Asset Pipeline

You want a game-ready 3D model from one line of text, and a second skin for the same mesh. This app runs 4 fal steps, then 2 Meshy steps for a character. You check the result of each step before you pay for the next one:

1. Concept art from your text (`fal-ai/flux-2`), or an image that you upload.
2. A low-poly mesh with clean triangles and PBR textures (Meshy Smart Topology).
3. A new skin for the same object (`fal-ai/flux-2/edit`).
4. The mesh from step 2, painted with the new skin (Meshy 7 Retexture).
5. A skeleton for the mesh from step 4 (Meshy Rigging).
6. An animation on that skeleton (Meshy Animation).

## Run it

1. From the repo root, run `pnpm install`.
2. Run `pnpm --filter game-asset-pipeline dev`.
3. Open http://localhost:3100.
4. Paste a fal key from https://fal.ai/dashboard/keys.
5. Click each step in order. Each 3D step takes a few minutes.

The key stays in this tab only. A reload clears it. fal bills each step.

The server routes are `src/routes/api.concept.ts` and `src/routes/api.model3d.ts`. The UI is `src/routes/index.tsx`.

## Rig and animate a character

Steps 5 and 6 call the Meshy API directly, so they need a Meshy key. Meshy bills each step.

1. Get a key from https://www.meshy.ai/developers/keys.
2. Paste it in the Meshy key field at the top of the page. Or add `MESHY_API_KEY=<your key>` to `.env` in this folder, then restart the dev server.
3. In step 1, describe a humanoid character, for example "A knight in a T-pose". Rigging does not work on a chest or a car.
4. Run steps 2 to 4, then click **Rig**.
5. Click **Animate**. The download link gives you the animated GLB.

The rig result also has basic walk and run animations. The server finds the key with `getByokKey(request, meshyByok)`. A request header with a Meshy BYOK key comes first, then `MESHY_API_KEY`.

To use another animation, change `animationActionId` in `src/routes/api.model3d.ts`. The ids are in the [Meshy animation library](https://docs.meshy.ai/en/api/animation-library).
