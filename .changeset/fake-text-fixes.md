---
'@tanstack/ai': patch
---

Fix three problems in `fakeText` from `@tanstack/ai/testing`.

- `fakeText()` type-checks as a text adapter with `exactOptionalPropertyTypes: true`. `inputModalities` is now an optional property.
- `RUN_STARTED` carries `parentRunId` when the call has one, as real adapters do.
- Tool call ids are unique across `fakeText()` instances. The default id is now `fake-call-<fake>-<call>-<index>`.
