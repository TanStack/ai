---
'@tanstack/ai': minor
'@tanstack/ai-code-mode': minor
'@tanstack/ai-code-mode-skills': minor
'@tanstack/ai-isolate-cloudflare': minor
'@tanstack/ai-isolate-node': minor
'@tanstack/ai-isolate-quickjs': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-ollama': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-client': patch
'@tanstack/ai-devtools': patch
---

Add code mode and isolate packages for secure AI code execution

Also includes fixes for Ollama tool call argument streaming and usage
reporting, OpenAI realtime adapter handling of missing call_id/item_id,
realtime client guards for missing toolCallId, and new DevtoolsChatMiddleware
type export from ai-event-client.
