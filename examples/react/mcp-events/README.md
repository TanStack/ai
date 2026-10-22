# MCP Events

You want an MCP server to push a signed webhook to your app. This Start app
subscribes to `incident.created`, then receives the delivery through
`createMCPEventWebhook`.

Subscribe uses a loopback transport in the same process. Emit signs a Standard
Webhooks body and posts it to `/api/mcp-events`. Production apps subscribe to
a real MCP server over HTTP.

## Run it

1. From the repo root, run `pnpm install`.
2. Run `pnpm --filter mcp-events dev`.
3. Open http://127.0.0.1:3101.
4. Click Subscribe, then Emit incident.

The page shows the catalog, the subscription id, and the verified event.

The webhook is `src/routes/api.mcp-events.ts`. Subscribe and emit live in
`src/lib/desk.ts`. The page is `src/routes/index.tsx`.
