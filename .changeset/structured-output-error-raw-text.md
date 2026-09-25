---
'@tanstack/ai': minor
---

Put the full model text on the error that `await chat({ outputSchema })` throws when the structured output fails to parse. Read it from `error.rawText`. The message still holds only a 200-character preview, so before this change a caller could not recover an answer that was valid JSON followed by extra text.
