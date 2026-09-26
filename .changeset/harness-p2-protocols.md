---
'@tanstack/ai-harness': minor
'@tanstack/ai-harness-cli': minor
'@tanstack/ai-acp': minor
'@tanstack/ai': minor
---

Harness sessions now survive a crash and talk to clients.

- **Resume.** A session holds a lease on each running turn, saves the transcript around each tool phase, and records tool calls that have no result yet. When a host opens a session whose turn lost its lease, it continues the turn in a new run and emits `harness.operation.resumed`. `toolDefinition({ replay: 'safe' | 'never' })` in `@tanstack/ai` decides whether an unfinished tool runs again.
- **Protocol.** `createHarnessHandler` serves capabilities, standard AG-UI runs, the session event stream with cursors, control inputs with receipts, and snapshots. `authorize` is required. `handleHarnessSocket` serves the same session tier over a WebSocket. `createHarnessClient` in `@tanstack/ai-harness/client` is a typed, reconnecting client.
- **`harnessText`** runs a harness as the text adapter of another `chat()` call.
- **ACP v2.** `@tanstack/ai-acp/agent` adds `createAcpAgent` and `serveAcp`, which serve a harness as an ACP v2 agent (experimental, like the draft protocol). `@tanstack/ai-acp` now uses `@agentclientprotocol/sdk` 1.5. The existing ACP client adapters keep working.
- **New package `@tanstack/ai-harness-cli`.** `runCli(harness)` gives a harness an Ink terminal UI, a print mode with exit codes, NDJSON output, `--acp`, and `--serve`.
