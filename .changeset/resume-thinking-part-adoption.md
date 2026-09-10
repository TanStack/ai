---
'@tanstack/ai': patch
---

Stop a mid-stream resume from duplicating the reasoning block. A hydrated message has no `stepId` on its thinking part — the stored form has nowhere to keep one — so the reasoning replayed on rejoin, which is keyed by `stepId`, matched nothing and was appended, leaving the turn as thinking, text, thinking. `updateThinkingPart` now falls back to the first thinking part that has no `stepId` and adopts it, carrying its signature over so the provider's encrypted reasoning is not lost. Parts that already belong to another step are never adopted, so separate reasoning steps still get separate parts.
