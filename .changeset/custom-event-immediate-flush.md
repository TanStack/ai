---
'@tanstack/ai': minor
'@tanstack/ai-sandbox': patch
---

Flush CUSTOM events through the durability layer as soon as they are emitted, so progress events such as `compaction:started` reach the client at emit time. High-volume events (`process.stdout`, `process.stderr`, `sandbox.file`, `sandbox.file.diff`) still batch. Pass `{ batch: true }` on `emitCustomEvent` to opt an event into the batch.
