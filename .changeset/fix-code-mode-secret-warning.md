---
'@tanstack/ai-code-mode': patch
---

fix(ai-code-mode): warn when tool parameters look like secrets

Add `warnIfBindingsExposeSecrets()` that scans tool input schemas for secret-like parameter names (`apiKey`, `token`, `password`, etc.) and emits `console.warn` during development. Code Mode executes LLM-generated code — any secrets passed through tool parameters are accessible to generated code.
