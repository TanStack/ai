---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-devtools-core': patch
'@tanstack/ai-event-client': minor
---

Preserve tool-result identity, metadata, multimodal content, and timestamps across message conversions and hydration.

Correct the public `WireMessage` type. System and user messages now require content, and the union no longer includes outbound activity messages.

Keep structured multimodal content compatible with the AI devtools message store.
