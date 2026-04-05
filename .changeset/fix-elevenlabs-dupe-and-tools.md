---
'@tanstack/ai-elevenlabs': patch
---

fix(ai-elevenlabs): prevent duplicate user messages and fix client tools registration

- Only emit `transcript` for user messages and `message_complete` for assistant messages, matching the contract expected by `RealtimeClient`
- Pass client tools as plain async functions to `@11labs/client@0.2.0` instead of `{ handler, description, parameters }` objects which were silently ignored
