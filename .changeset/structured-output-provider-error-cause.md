---
'@tanstack/ai': patch
---

Keep the provider's error body on the error that `await chat({ outputSchema })` throws when the adapter streams structured output itself (for example OpenRouter). Read it from `error.cause`. Before, only a short message like `Provider returned error` reached the caller, so the real reason (for example a provider 400 body) was lost.
