# Evaluate

Paste a support ticket. Jev answers three typed questions: which queue, how urgent, and whether the customer asks for a refund.

## Run it

1. From the repo root, run `pnpm install`.
2. Copy `.env.example` to `.env` and add a key for the provider you pick.
3. Run `pnpm --filter evaluate dev`.
4. Open http://localhost:3100.
5. Pick a provider. Click Submit.

API keys stay on the server.

The UI is `src/routes/index.tsx`. The `decide()` call is `src/lib/server-functions.ts`.
