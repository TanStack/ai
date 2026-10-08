---
'@tanstack/ai-harness': minor
---

Run a harness outside your server.

- **`@tanstack/ai-harness/build`**: `buildHarness` bundles a harness with Bun into a worker artifact (`harness.js`) and writes `harness.manifest.json` (name, agents, plugins, requirements, sha256 digest). With `compile`, it also builds a single executable. `artifactText(dir)` runs the artifact as worker processes and uses it as a text adapter, after it checks the digest. `readManifest` reads and checks a manifest.
- **`@tanstack/ai-harness/worker`**: `runHarnessWorker` serves a harness as session-tier frames over NDJSON on stdin and stdout.
- **`harnessText({ url, token })`** uses a harness served by `createHarnessHandler` (or `runCli --serve`) on another machine as a text adapter.
