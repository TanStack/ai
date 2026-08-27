---
'@tanstack/ai': patch
---

Preserve draft-07 tuple `items` arrays during structured-output conversion.

Keep a single widening map for homogeneous arrays so `undoNullWidening` applies it to every element.
