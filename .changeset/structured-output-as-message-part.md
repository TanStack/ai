---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-svelte': minor
---

feat: structured-output as a typed MessagePart on each assistant UIMessage

`useChat({ outputSchema })` (React, Vue, Solid) and `createChat({ outputSchema })` (Svelte) previously kept a single hook-level `partial`/`final` slot, so multi-turn structured chats lost every prior turn's response as soon as a new one streamed in. Each assistant turn now carries its own typed `structured-output` MessagePart on the UIMessage it belongs to. History walks `messages` and finds the typed part on each turn; the hook-level `partial` and `final` are derived from the latest assistant message's part and continue to work as before. Applies to all four framework hook packages.

The structured-output part type is generic over the schema's inferred data type:

- `StructuredOutputPart<TData = unknown>` in `@tanstack/ai` carries `data: TData`, `partial: DeepPartial<TData>`, `raw: string`, plus `status: 'streaming' | 'complete' | 'error'` and an optional `errorMessage`.
- `MessagePart<TTools, TData>` and `UIMessage<TTools, TData>` in `@tanstack/ai-client` thread the generic through the message types.
- Each framework hook's return (`UseChatReturn<TTools, TSchema>` for React / Vue / Solid, `CreateChatReturn<TTools, TSchema>` for Svelte) substitutes `TData = InferSchemaType<TSchema>` when a schema is supplied, so `messages[i].parts.find(p => p.type === 'structured-output').data` is typed by the schema with no cast required.

Default `TData = unknown` keeps every existing consumer that doesn't pass a schema source-compatible.

Server-side `chat({ outputSchema, stream: true })` emits a new `structured-output.start` CUSTOM event before the JSON deltas so the client processor can route them into the StructuredOutputPart instead of building a TextPart. The wire converter serializes the part's raw JSON back as assistant content, so multi-turn structured chats stay coherent (the LLM sees its own prior structured responses on follow-up turns). For adapters without native JSON-schema streaming (Anthropic, Gemini, Ollama), the existing fallback path emits one terminal `structured-output.complete` event and the same per-turn typed part lands on the message — consumer code is identical.

A new example route demonstrating the multi-turn pattern is at `/generations/structured-chat` in the `ts-react-chat` example.

**Breaking-shape note (minor, not major):** When `outputSchema` is set, `TEXT_MESSAGE_CONTENT` deltas no longer create a `TextPart` on the assistant message — they accumulate into the `StructuredOutputPart`. Consumers that iterated `message.parts` and explicitly filtered out `TextPart`s to hide raw JSON (the workaround documented prior to this change) can remove that filter; doing nothing is also safe because no `TextPart` is produced in the first place.
