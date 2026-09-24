---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-gemini': minor
---

Preserve source links for hosted web search calls. OpenAI Responses `web_search_call` items and Gemini Google Search grounding now surface as provider-executed tool calls with a normalized `metadata.sources` array (new `ProviderExecutedToolSource` type) and the raw provider data under `metadata.openai` / `metadata.gemini`. The OpenAI adapter requests `web_search_call.action.sources` when a branded web search tool is used, and both adapters replay the raw items on the next turn instead of treating them as function calls.
