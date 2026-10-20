---
'@tanstack/ai-harness-cli': patch
---

`--serve` signs media URLs with its own key, never with the token: `--media-key` or `HARNESS_MEDIA_KEY` (at least 32 bytes), or a new random key at each start. Without a set key, signed media URLs stop working after a restart. On a host without `access`, it also passes `openAccess`: the `principal` of `runCli`, or `true` without one. So each request with the token runs as the user of the CLI. On a host with `access`, `identify` reads the user of each request.
