# Effect Chat

You want a streaming chat where the server is written with Effect. Ask for the weather in a city. The model calls a tool that is an Effect, and a Layer gives that tool its service.

## Run it

1. Copy `.env.example` to `.env.local` and put your OpenAI key in it.
2. From the repo root, run `pnpm install`.
3. Run `pnpm --filter effect-chat dev`.
4. Open http://localhost:3100.
5. Type "What is the weather in Oslo?" and click Send.

The tool and its service are in `src/lib/weather.ts`. The server route is `src/routes/api.chat.ts`. The chat UI is `src/routes/index.tsx`.
