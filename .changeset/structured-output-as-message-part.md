---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
---

feat: structured-output as a typed MessagePart on each assistant UIMessage

`useChat({ outputSchema })` previously kept a single hook-level `partial`/`final`
slot, so multi-turn structured chats lost every prior turn's response as soon
as a new one streamed in. Each assistant turn now carries its own typed
`structured-output` MessagePart on the UIMessage it belongs to. History walks
`messages` and finds the typed part on each turn; the hook-level `partial`
and `final` are derived from the latest assistant message's part and continue
to work as before.

Server-side `chat({ outputSchema, stream: true })` emits a new
`structured-output.start` CUSTOM event before the JSON deltas so the client
processor can route them into the StructuredOutputPart instead of building a
TextPart. The wire converter serializes the part's raw JSON back as assistant
content, so multi-turn structured chats stay coherent (the LLM sees its own
prior structured responses on follow-up turns).

A new example route demonstrating this pattern is at
`/generations/structured-chat` in the `ts-react-chat` example.
