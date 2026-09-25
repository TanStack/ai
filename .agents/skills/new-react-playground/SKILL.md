---
name: new-react-playground
description: Use when an agent in this TanStack AI monorepo needs a playground app to try a new feature. Trigger: new feature to try in a Start React app in this repo.
---

# new-react-playground

Pick a kebab-case name. Then generate a React chat lab under `examples/react/<name>/`.

The generator writes a thin chat lab. The app includes:

- BYOK
- Model picker
- `/api/chat` with `chat()`

The index route is the chat shell. The dev server uses port `3100`.

## Must

1. Pick a kebab-case name.
2. From the repo root, run `pnpm nx g @tanstack/workspace-plugin:react-app <name>`. The app lands at `examples/react/<name>/`.
3. Run `pnpm install`.
4. Implement the feature on the index route. If the server must change, edit `/api/chat`.
5. Run `pnpm --filter <name> dev` (port 3100).

Do not commit the new example. After a human asks to keep it, you can commit it.

## Later

If you need live model keys, copy `.env.example` to `.env.local`.

Open `http://localhost:3100`. The chat lab is live. Your feature is on the index route.
