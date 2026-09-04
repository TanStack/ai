# World generation (ts-react-world)

A small TanStack Start app that shows the `generateWorld()` activity opening a
live Reactor session. Paste a Reactor key in the browser (BYOK). The relay
mints a session-scoped token. The page connects with the Reactor JS SDK,
starts the stream, and can steer the scene with a new prompt.

## Tech stack

- TanStack Start (full-stack React)
- `@tanstack/ai` - the `generateWorld()` activity
- `@tanstack/ai-reactor` - `reactorWorld(...)` and `reactorByok`
- `@tanstack/ai-client` / `@tanstack/ai-react` - BYOK store and `useByok`
- `@reactor-team/js-sdk` - browser connect and video track

## Getting started

```bash
cd examples/ts-react-world
pnpm install
pnpm dev
```

Open http://localhost:3000. Paste a key from https://www.reactor.inc/dashboard
(keys start with `rk_`). You can also copy `.env.example` to `.env` and set
`REACTOR_API_KEY` if you want the relay to use an env key when the browser
has none.

## What the example shows

**BYOK.** `src/lib/byok.ts` stores the key in the browser. `POST /api/world`
reads `x-byok-reactor`, then `REACTOR_API_KEY`. The key is not in the JSON
body.

**The browser plays the live stream.** After the relay returns `token`,
`model`, and `prompt`, the client connects with `@reactor-team/js-sdk`, sets
the prompt, and starts generation. A later `set_prompt` morphs the scene at
the next chunk.

## Files worth reading

| File                             | What's in it                   |
| -------------------------------- | ------------------------------ |
| `src/routes/api.world.ts`        | The `generateWorld()` call     |
| `src/lib/byok.ts`                | The Reactor BYOK store         |
| `src/components/WorldStudio.tsx` | Connect, play, steer, and stop |
| `src/lib/models.ts`              | Model list and example prompts |

## Learn more

- [World Generation](../../docs/media/world-generation.md)
- [Reactor adapter](../../docs/adapters/reactor.md)
