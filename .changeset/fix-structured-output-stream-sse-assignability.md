---
"@tanstack/ai": patch
---

fix(ai): restore `StructuredOutputStream` assignability to `AsyncIterable<StreamChunk>` so it can be passed to `toServerSentEventsResponse`

`StructuredOutputStartEvent`, `StructuredOutputCompleteEvent`, `ApprovalRequestedEvent`, and `ToolInputAvailableEvent` declared their shape with `extends Omit<CustomEvent, 'name' | 'value'>`. Because `CustomEvent` is inferred from a zod `passthrough` schema, it carries a `[k: string]: unknown` index signature, and `Omit` on a type with a `string` index signature collapses every surviving property to `unknown` — including `type: 'CUSTOM'`. That broke union assignability against `AGUIEvent`/`StreamChunk`, so `toServerSentEventsResponse(stream)` failed to typecheck against streams returned by `chat({ outputSchema, stream: true })`.

Switched to `extends CustomEvent` with refined `name`/`value` (allowed: narrower types of declared properties), which keeps `type: 'CUSTOM'` intact and preserves the existing discriminated-narrowing patterns.
