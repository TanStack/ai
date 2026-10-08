---
'@tanstack/ai': minor
---

Text adapters can declare `inputModalities`, the input kinds the model reads, at runtime. A `BaseTextAdapter` subclass sets it from its model metadata, and `undefined` means not known.
