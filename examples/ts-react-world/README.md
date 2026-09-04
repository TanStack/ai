# World generation (ts-react-world)

A small TanStack Start app that shows the `generateWorld()` activity opening a
live Reactor session. The server mints a session-scoped token. The browser
connects with the Reactor JS SDK, starts the stream, and can steer the scene
with a new prompt.

## Tech stack

- TanStack Start (full-stack React)
- `@tanstack/ai` — the `generateWorld()` activity
- `@tanstack/ai-reactor` — `reactorWorld(...)`
- `@reactor-team/js-sdk` — browser connect and video track

## Getting started

```bash
cd examples/ts-react-world
pnpm install
cp .env.example .env
# Add REACTOR_API_KEY from https://www.reactor.inc/dashboard
pnpm dev
```

Open http://localhost:3000.

## What the example shows

**Keys stay on the server.** `src/lib/server-functions.ts` calls
`generateWorld({ adapter: reactorWorld(model), prompt })`. The API key never
reaches the browser.

**The browser plays the live stream.** After the server returns `token`,
`model`, and `prompt`, the client connects with `@reactor-team/js-sdk`, sets
the prompt, and starts generation. A later `set_prompt` morphs the scene at
the next chunk.

## Files worth reading

| File                             | What's in it                   |
| -------------------------------- | ------------------------------ |
| `src/lib/server-functions.ts`    | The `generateWorld()` call     |
| `src/components/WorldStudio.tsx` | Connect, play, steer, and stop |
| `src/lib/models.ts`              | Model list and example prompts |

## Learn more

- [World Generation](../../docs/media/world-generation.md)
- [Reactor adapter](../../docs/adapters/reactor.md)
