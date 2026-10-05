---
'@tanstack/ai-harness': minor
---

Plugins and models per turn.

- A plugin with `lifetime: 'turn'` is set up for each chat turn and disposed when the turn ends. `'run'` still works the same way, as an old name for `'turn'`.
- `adapter` in `defineHarness` is optional. A plugin `adapter()` or the turn's `overrides.adapter` can give the model. A turn with no model fails with a clear error.
- `harnessText(harness, { inputModalities })` sets the input kinds the harness takes, for a harness without an adapter.
