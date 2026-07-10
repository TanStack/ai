---
'@tanstack/ai-gemini': patch
---

fix(ai-gemini): fix `GeminiClientConfig` type import in the published adapter declarations. The emitted `.d.ts` files imported `GeminiClientConfig` from a non-existent `'../utils.js'` (the barrel builds to `utils/index.js`), so under `skipLibCheck` it silently resolved to `any` in consumers — masking client-config type-checking for every adapter and producing a spurious "`httpOptions` does not exist" error on `createGeminiVideo`. Adapters now import the type from the concrete `'../utils/client'` module so the declarations resolve to the real type.
