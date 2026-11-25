# Generate Motion

You need animation clips for a game ability. This app makes two clips for an orc "Leap Slam": the orc attack and the enemy reaction. Then it shows the ability manifest that your game imports.

## Run it

1. From the repo root, run `pnpm install`.
2. Run `pnpm --filter generate-motion dev`.
3. Open http://localhost:3100.
4. Paste a fal key from https://fal.ai/dashboard/keys. You can also set `FAL_KEY` in `.env.local`.
5. Click Generate on each clip. When both clips are done, the manifest shows.

The key stays in this tab only. A reload clears it.

## What you get

- Each clip is an FBX file from fal Hunyuan Motion (`fal-ai/hunyuan-motion`).
- The clip uses an SMPL-H skeleton (52 bones, root bone `Pelvis`) at 30 fps. Root motion is in the `Pelvis` bone. Retarget the clip to your rig in your engine.
- `scripts/generate-orc-clips.ts` makes the six orc clips in one run: `FAL_KEY=... node scripts/generate-orc-clips.ts`. The files go to `output/orc-axe/`, which git ignores.
- fal file links expire. Download each file and store it with your game assets.

## Stop and cancel

- Stop watching closes the stream in this tab. The fal job keeps running.
- Cancel on fal asks fal to stop the job. A job that already runs can still finish.

## Files

- `src/routes/api.generate.motion.ts`: submits the job and streams its status.
- `src/routes/api.motion.cancel.ts`: cancels a job on fal.
- `src/routes/index.tsx`: the two clips and the manifest.
