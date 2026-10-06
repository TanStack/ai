---
'@tanstack/ai-byteplus': patch
---

Use a leftover `content` field as the reasoning delta only when it is a string. Activity events can now carry an object in `content`.
