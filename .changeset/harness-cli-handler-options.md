---
'@tanstack/ai-harness-cli': patch
---

`--serve` passes `media: { secret }` to the harness handler. On a host without `access`, it also passes `openAccess`: the `principal` of `runCli`, or `true` without one. So each request with the token runs as the user of the CLI. On a host with `access`, `identify` reads the user of each request.
