---
'@tanstack/ai-harness': minor
---

`@tanstack/ai-harness/build` and `@tanstack/ai-harness/worker`: `buildHarness` bundles a harness with Bun into a worker artifact (`harness.js` and a `harness.manifest.json` with the sha256 digest), and can also build a single executable. `artifactText(dir)` checks the digest and uses the artifact as the model of a `chat()` call, with one worker process per thread. `runHarnessWorker` runs a harness on stdin and stdout with the session frames of the harness protocol.
