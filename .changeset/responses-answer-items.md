---
'@tanstack/ai': minor
'@tanstack/openai-base': patch
---

Keep each OpenAI Responses answer item's `id` and `phase` (`commentary` or `final_answer`) on the assistant message, in `metadata.tanstack.responseItems`. A same-model replay sends each item back with its `id` and `phase`. Another model gets the plain text, as before.
