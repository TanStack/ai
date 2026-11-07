---
'@tanstack/ai': patch
'@tanstack/ai-harness': patch
---

`@tanstack/ai` exports `stableJson`: JSON text with the keys of every object in sorted order, for values that come back from a store with their keys reordered. `@tanstack/ai-harness` now imports it and no longer keeps its own copy.
