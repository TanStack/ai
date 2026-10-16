---
'@tanstack/ai-harness-cli': minor
---

Add `@tanstack/ai-harness-cli`: `runCli(harness)` runs a harness from the terminal.

- Line mode reads one message or `/command` per line, answers approvals and questions, hides a secret answer while the user types, and sends `@path` files. Pass `ui` to show your own screen on a session view instead.
- `-p "prompt"` runs one prompt for scripts and CI, and `--output ndjson` prints every AG-UI event.
- `--serve` serves the session protocol over HTTP behind a bearer token.
- `--acp`, `--mcp`, and `--dashboard` load `@tanstack/ai-acp`, `@tanstack/ai-mcp`, and `@tanstack/ai-dashboard` only when you use the flag. A missing package, or one without harness support, fails that flag with a clear message.
- `host` and `principal` options let the CLI use your durable host and run as your user.
