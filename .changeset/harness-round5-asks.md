---
'@tanstack/ai': minor
'@tanstack/ai-compaction': minor
'@tanstack/ai-harness': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-sandbox': minor
---

Add the harness asks from the fifth findings list.

- `chat({ outputSchema, stream: true })` now checks the full result against a Standard Schema. A failure ends with `RUN_ERROR` `structured-output-validation-failed`, with the model text in `metadata.tanstack.rawText`.
- `session.send(prompt, { outputSchema })` gives the turn a typed `structured` value. It is per send only, and the HTTP handler does not take it.
- A server tool reads run capabilities with `context.get(capability)` and `context.getOptional(capability)`, for example the sandbox under `withSandbox`.
- Readers keep the full history after a durable compaction. `session.transcript()`, `GET transcript`, and the chat hydration show every message. The model still gets the compacted context.
- `createHarnessHost({ acceptInput })` sees each input after the access check and before the log keeps it. It can change the input or refuse it.
- A plugin `adapter()` pick with `override: true` wins over the stored thread model.
- `onModelError` can return `{ retry: true, adapter }` to retry on another model. `ModelErrorContext` has `adapter` and `model`.
- Middleware reads `ctx.context.run.source` and `label` to tell a turn call from a plugin, router, or transfer call.
- `host.sessions.archive()` and `unarchive()`. Lists hide archived threads unless you pass `withArchived: true`.
- `host.sessions.eraseUser({ harness, threadId, userId, replies })` replaces one person's messages with `[removed]`, deletes their media, and cuts the log before a new snapshot. The new `erase` access action guards it.
- `HarnessRecord` is exported, for a typed `LogStore` wrapper.
- Coding-tool file calls pass their abort signal through `WorkspaceBackend` to the sandbox.
- `withCompaction` limits (`maxTokens`, `contextWindow`, `background.atTokens`) can be a function of `{ model }`.
