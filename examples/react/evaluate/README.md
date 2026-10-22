# Evaluate

Paste a support ticket. The app shows three typed answers: queue, urgency, and refund.

## Run it

1. From the repo root, run `pnpm install`.
2. Copy `.env.example` to `.env`. Add a key only for a hosted provider.
3. For Ollaya, run `ollaya serve` and `ollaya pull laya:latest`. No key.
4. Run `pnpm --filter evaluate dev`.
5. Open http://localhost:3100. Pick a provider. Click Submit.

API keys for hosted providers stay on the server.

The UI is `src/routes/index.tsx`. The `decide()` call is `src/lib/server-functions.ts`.
