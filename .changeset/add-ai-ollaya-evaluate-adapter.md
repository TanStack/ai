---
'@tanstack/ai-ollaya': minor
---

Add `@tanstack/ai-ollaya`, an evaluate adapter for a local Ollaya decision
server. `ollayaDecider(model)` runs `decide()` against the open-source `laya`
models over Ollaya's `POST /v1/systemone` endpoint — same wire contract as
TypeSafe's Jev, fully local, no API key. Defaults to `http://127.0.0.1:11435`.
