---
'@tanstack/ai': patch
'@tanstack/ai-client': patch
'@tanstack/ai-event-client': patch
---

Preserve tool-result identity, metadata, multimodal content, and timestamps across message conversions and hydration.

Correct the public `WireMessage` type. System and user messages now require content, and the union no longer includes outbound activity messages.
