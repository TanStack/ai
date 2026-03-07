---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-elevenlabs': minor
'@tanstack/ai-react': minor
---

feat: add realtime voice chat with OpenAI and ElevenLabs adapters

Adds realtime voice/text chat capabilities:

- **@tanstack/ai**: `realtimeToken()` function and shared realtime types (`RealtimeToken`, `RealtimeMessage`, `RealtimeSessionConfig`, `RealtimeStatus`, `RealtimeMode`, `AudioVisualization`, events, and error types)
- **@tanstack/ai-client**: Framework-agnostic `RealtimeClient` class with connection lifecycle, audio I/O, message state management, tool execution, and `RealtimeAdapter`/`RealtimeConnection` interfaces
- **@tanstack/ai-openai**: `openaiRealtime()` client adapter (WebRTC) and `openaiRealtimeToken()` server token adapter with support for semantic VAD, multiple voices, and all realtime models
- **@tanstack/ai-elevenlabs**: `elevenlabsRealtime()` client adapter (WebSocket) and `elevenlabsRealtimeToken()` server token adapter for ElevenLabs conversational AI agents
- **@tanstack/ai-react**: `useRealtimeChat()` hook with reactive state for status, mode, messages, pending transcripts, audio visualization levels, VAD control, text/image input, and interruptions
- **Docs**: Realtime Voice Chat guide and full API reference for all realtime classes, interfaces, functions, and type aliases
