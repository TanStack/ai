---
'@tanstack/ai-gemini': patch
'@tanstack/ai': minor
'@tanstack/ai-event-client': minor
---

fix(ai-gemini): read/write thoughtSignature at Part level + thread typed metadata through tool-call lifecycle

Two fixes shipped together because the adapter fix is only effective once the framework also preserves provider metadata across the tool-call round-trip.

**Adapter (Gemini):** Gemini emits `thoughtSignature` as a Part-level sibling of `functionCall` (per the `@google/genai` `Part` type definition), not nested inside `functionCall`. The `FunctionCall` type has never had a `thoughtSignature` property. The adapter was reading from `functionCall.thoughtSignature` (does not exist in SDK types) and writing it back nested inside `functionCall`, causing Gemini 3.x to reject subsequent tool-call turns with `400 INVALID_ARGUMENT: "Function call is missing a thought_signature"`.

- **Read side:** reads `part.thoughtSignature` directly using the SDK's typed `Part` interface
- **Write side:** emits `thoughtSignature` as a Part-level sibling of `functionCall`

**Framework (typed tool-call metadata):**

- `ToolCall.providerMetadata: Record<string, unknown>` is now `ToolCall<TMetadata>.metadata?: TMetadata`, mirroring the existing typed-metadata pattern on content parts (`ImagePart<TMetadata>`, `AudioPart<TMetadata>`, etc.).
- `ToolCallPart` gains a typed `metadata?: TMetadata` field (also generic).
- `ToolCallStartEvent.providerMetadata` becomes `metadata` (kept as `Record<string, unknown>` because the AGUIEvent discriminated union does not survive a generic on the event type; adapters cast to their typed shape when emitting).
- `BaseTextAdapter` and `TextAdapter` gain a sixth generic `TToolCallMetadata` (default `unknown`), exposed via `~types.toolCallMetadata` for inference at call sites.
- `InternalToolCallState` gains a `metadata?: Record<string, unknown>` field captured at `TOOL_CALL_START` and threaded through `updateToolCallPart`, `buildAssistantMessages`, `modelMessageToUIMessage`, and `completeToolCall`, fixing a previously-silent drop of provider metadata across the client-side UIMessage pipeline (closes the gap surfaced in #403/#404).

**Gemini concrete impl:** new `GeminiToolCallMetadata { thoughtSignature?: string }` exported from `@tanstack/ai-gemini`. The adapter declares its `TToolCallMetadata` as this type, so consumers see `toolCall.metadata?.thoughtSignature` typed end-to-end.

**Breaking:** consumers reading `toolCall.providerMetadata` or `toolCallStartEvent.providerMetadata` should rename to `metadata`.
