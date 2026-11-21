---
'@tanstack/ai-mcp': patch
---

`createMCPEventWebhook` no longer requires the `webhook-id` header to equal the event's `eventId`. SEP-3415 says `webhook-id` is a per-message id that must not be derived from `eventId`, so the receiver returned 400 for every event from a server that follows the spec. It now accepts both a per-message id and the older `webhook-id` = `eventId` form. `onEvent` still gets the header as `messageId`, so keep deduplicating on `(subscription.id, messageId)`.
