---
'@tanstack/ai': minor
'@tanstack/ai-anthropic': patch
'@tanstack/ai-client': minor
---

**Fix thinking blocks getting merged across steps and lost on turn 2+ of Anthropic tool loops.**

Each thinking step emitted by the adapter now produces its own `ThinkingPart` on the `UIMessage` instead of being merged into a single part, and thinking content + Anthropic signatures are preserved in server-side message history so multi-turn tool flows with extended thinking work correctly.

This includes a public callback signature change: `StreamProcessorEvents.onThinkingUpdate` now receives `(messageId, stepId, content)` instead of `(messageId, content)`. `ChatClient` has been updated to handle the new `stepId` argument internally, but consumers implementing `StreamProcessorEvents` directly need to add the new parameter.

`@tanstack/ai`:

- `ThinkingPart` gains optional `stepId` and `signature` fields.
- `ModelMessage` gains an optional `thinking?: Array<{ content; signature? }>` field so prior thinking can be replayed in subsequent turns.
- `StepFinishedEvent` gains an optional `signature` field for provider-supplied thinking signatures.
- `StreamProcessor` tracks thinking per-step via `stepId` and keeps step ordering. `getState().thinking` / `getResult().thinking` concatenate step contents in order.
- The `onThinkingUpdate` callback on `StreamProcessorEvents` now receives `(messageId, stepId, content)` — consumers implementing it directly must add the `stepId` parameter.
- `TextEngine` accumulates thinking + signatures per iteration and includes them in assistant messages with tool calls so the next turn can replay them.

`@tanstack/ai-anthropic`:

- Captures `signature_delta` stream events and emits the final `STEP_FINISHED` with the signature on `content_block_stop`.
- Includes thinking blocks with signatures in `formatMessages` for multi-turn history.
- Passes `betas: ['interleaved-thinking-2025-05-14']` to the `beta.messages.create` call site when a thinking budget is configured. The beta flag is scoped to the streaming path only, so `structuredOutput` (which uses the non-beta `messages.create` endpoint) is unaffected.

`@tanstack/ai-client`:

- `ChatClient`'s internal `onThinkingUpdate` wiring is updated for the new `stepId` parameter.
