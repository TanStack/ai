---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-octane': minor
'@tanstack/ai-remix': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
---

Export `StreamHttpError` from `@tanstack/ai-client` and re-export it from the framework packages (`@tanstack/ai-react`, `@tanstack/ai-solid`, `@tanstack/ai-preact`, `@tanstack/ai-vue`, `@tanstack/ai-octane`, `@tanstack/ai-remix`, `@tanstack/ai-svelte`, `@tanstack/ai-angular`). A failed HTTP stream connect throws this class, which has `status` and `retryAfterMs`. Import it to check the status with `instanceof` instead of parsing the error message.
