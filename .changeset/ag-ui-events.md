---
"@tanstack/ai": minor
"@tanstack/ai-openai": minor
"@tanstack/ai-anthropic": minor
"@tanstack/ai-gemini": minor
"@tanstack/ai-ollama": minor
---

feat: Add AG-UI protocol events to streaming system

All text adapters now emit AG-UI protocol events in addition to supporting legacy event types:

- `RUN_STARTED` / `RUN_FINISHED` - Run lifecycle events
- `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` - Text message streaming
- `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` - Tool call streaming

This provides a standardized event format across all adapters while maintaining backward compatibility with existing code that processes legacy `content`, `tool_call`, and `done` events.
