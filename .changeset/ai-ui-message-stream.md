---
'@tanstack/ai-ui-message-stream': minor
---

Add `@tanstack/ai-ui-message-stream`, a stop gap for porting an app from the Vercel AI SDK one side at a time. It connects TanStack AI to the AI SDK UI message stream.

- Serve AI SDK `useChat` from `chat()` with `chatParamsFromAISDKRequest` and `toUIMessageStream`. Use `toResumableUIMessageStreamResponse` and `resumeUIMessageStreamResponse` for `useChat({ resume: true })`.
- Point TanStack `useChat` at an AI SDK route with `fromChatTransport(new DefaultChatTransport({ api }), { threadId, tools })`.

Text, reasoning with its signature, tool calls and results, client tools, tool approvals, activity and stream resume cross in both directions. Subagents and shared state go from a TanStack server to an AI SDK client only.
