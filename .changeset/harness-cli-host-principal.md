---
'@tanstack/ai-harness-cli': minor
---

`runCli(harness, { host, principal })` can use your own host and user.

- `host`: the CLI uses this host and does not close it. Without it, the CLI makes its own host and closes it at the end.
- `principal`: every session the CLI opens runs as this principal, and `--serve` gives it to each request with the token. The default is still `{ id: 'cli' }`.
- `host` and `persistence` together fail with "Give runCli a host or persistence, not both."
