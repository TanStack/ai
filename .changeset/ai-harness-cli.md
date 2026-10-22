---
'@tanstack/ai-harness-cli': minor
---

Add `@tanstack/ai-harness-cli`: `runCli(harness)` runs a harness from the terminal.

- Line mode reads one message or `/command` per line, hides a secret answer while the user types, and sends `@path` files. In a terminal, `/cancel` and a message typed while a turn runs act at once: the message joins the running turn. When a turn waits, each next line answers one wait: `y` or `n` for an approval (`once`, `always`, or `reject` for an approval of `permissions()`), and an answer read with the schema for a question. Pass `ui` to show your own screen on a session view instead.
- `-p "prompt"` runs one prompt for scripts and CI, and `--output ndjson` prints every AG-UI event. `-p` exits with code 3 (`EXIT.needsAction`) at the first wait of the turn: an approval, a question, or a sign-in.
- `--serve` serves the session protocol over HTTP behind a bearer token. It signs media URLs with its own key, never with the token: `--media-key` or `HARNESS_MEDIA_KEY` (at least 32 bytes), or a new random key at each start. Without a set key, signed media URLs stop working after a restart. On a host without `access`, it also passes `openAccess`: the `user` of `runCli`, or `true` without one. So each request with the token runs as the user of the CLI.
- `--acp` and `--mcp` load `@tanstack/ai-acp` and `@tanstack/ai-mcp` only when you use the flag. A missing package, or one without harness support, fails that flag with a clear message. Any other error while the package loads is reported, not hidden.
- In every mode, the first SIGINT or SIGTERM cancels the running turn. A second one, or one while no turn runs, stops the CLI, and `runCli` resolves to 130 (SIGINT) or 143 (SIGTERM). The CLI closes a host that it made with `recoverable: true`, or releases its session handle on your own host and does not wait for a turn that ignores the cancel. The `signals` option takes another signal source, for example an `EventEmitter` in a test.
- `host` and `user` options let the CLI use your durable host and run as your user. Every mode opens its sessions as that user. On a host with `access`, `--serve` reads the user of each request with `getUser`, and `--mcp` does not start, because stdio has no login.
