---
'@tanstack/ai-uthana': minor
---

Add `@tanstack/ai-uthana`, an Uthana adapter for experimental motion generation. `uthanaMotion()` runs Uthana text-to-motion 3.0 jobs and returns FBX or GLB files on the chosen character, as `data:` URLs because Uthana serves files only with your key. `createUthanaCharacter()` uploads and auto-rigs your own humanoid model so motions come out on its proportions. Uthana has no cancel API, so the adapter has no remote cancel.
