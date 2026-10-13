---
'@tanstack/ai-bedrock': patch
---

The Bedrock text adapters (Converse, Chat Completions, and Responses) now set `inputModalities` from the model catalog. Before, it was always `undefined`. A known model gives the input kinds it reads, and an unknown model gives `undefined`.

On the Responses API, this also means a text-only model such as `openai.gpt-oss-120b-1:0` no longer gets image parts in a tool result, the same as other Responses adapters.
