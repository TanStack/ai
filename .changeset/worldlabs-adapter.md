---
'@tanstack/ai-worldlabs': minor
'@tanstack/ai': minor
---

Add `@tanstack/ai-worldlabs` with `worldlabsWorld()` for Marble world generation through `generateWorld()`. World Labs jobs return a viewer URL and splat/mesh assets. `WorldGenerationResult` now has optional `url`, `worldId`, `operationId`, and `assets` so job adapters can omit a live-session token.
