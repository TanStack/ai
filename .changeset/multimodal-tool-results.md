---
'@tanstack/ai': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-client': patch
'@tanstack/ai-react-ui': patch
'@tanstack/ai-solid-ui': patch
'@tanstack/ai-vue-ui': patch
---

Preserve multimodal tool results across chat history and provider adapters.

This fixes tool result handling so `ContentPart[]` outputs are preserved instead
of being stringified in core chat flows, OpenAI Responses tool outputs, and
Anthropic tool results. It also updates the client-side tool result type and
the default React, Solid, and Vue chat message renderers to handle text and
image tool result content.
