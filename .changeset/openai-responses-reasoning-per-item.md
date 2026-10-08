---
'@tanstack/openai-base': patch
---

Keep each Responses reasoning item as its own thinking step. A response that reasoned, ran a hosted `web_search`, then reasoned again stored only the last reasoning item, so replaying the turn failed with `Item 'ws_…' of type 'web_search_call' was provided without its required 'reasoning' item`.
