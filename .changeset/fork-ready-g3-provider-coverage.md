---
'@tanstack/openai-base': minor
'@tanstack/ai-openai': minor
---

The adapters now work with GitHub Copilot and with a ChatGPT plan token.

- The Responses adapter streams one tool call when the item id changes on each event. GitHub Copilot sends a new item id on each event of a stateless response.
- The OpenAI-compatible Chat Completions adapter reads the thinking that GitHub Copilot streams on `delta.reasoning_text`.
- The OpenAI-compatible docs list more providers and show the setup for GitHub Copilot and for a ChatGPT plan.
