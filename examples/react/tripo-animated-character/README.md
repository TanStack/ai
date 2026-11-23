# Tripo Animated Character

You want a game character that walks, made from one line of text. This app runs 3 Tripo steps, one after the other:

1. Make a 3D model from your text (`text-to-model`).
2. Add a skeleton to the model (`rig`, model `v3.0-20260909`).
3. Put the walk animation on the skeleton (`retarget` with `preset:walk`).

Each step sends its Tripo task id to the next step. The page then shows the walking character in `<model-viewer>`.

## Run it

1. Get a key from https://developers.tripo3d.ai/en/keys.
2. Copy `.env.example` to `.env` in this folder. Set `TRIPO_API_KEY=<your key>`.
3. From the repo root, run `pnpm install`.
4. Run `pnpm --filter tripo-animated-character dev`.
5. Open http://localhost:3100. Describe a character with two arms and two legs, then click **Make character**.

The 3 steps take a few minutes. Tripo bills each step. The key stays on the server.

The Tripo file link expires. To keep the character, download the file soon. To get a new link, make a new character.

The server route is `src/routes/api.character.ts`. Tripo serves its files with no CORS header, so `src/routes/api.file.ts` loads the file on the server for the viewer. The UI is `src/routes/index.tsx`.
