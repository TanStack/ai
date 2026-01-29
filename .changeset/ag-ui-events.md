---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-ollama': minor
'@tanstack/ai-openrouter': minor
---

feat: Add AG-UI protocol events to streaming system

All text adapters now emit AG-UI protocol events only:

- `RUN_STARTED` / `RUN_FINISHED` - Run lifecycle events
- `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` - Text message streaming
- `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` - Tool call streaming

Only AG-UI event types are supported; previous legacy chunk formats (`content`, `tool_call`, `done`, etc.) are no longer accepted.
