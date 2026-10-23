---
'@tanstack/ai-ui-message-stream': minor
---

Add `@tanstack/ai-ui-message-stream`, which connects TanStack AI to the Vercel AI SDK UI message stream.

- Serve AI SDK `useChat` from `chat()` with `chatParamsFromAISDKRequest` and `toUIMessageStream`. Use `toResumableUIMessageStreamResponse` and `resumeUIMessageStreamResponse` for `useChat({ resume: true })`.
- Point TanStack `useChat` at an AI SDK route with `fromChatTransport(new DefaultChatTransport({ api }), { threadId, tools })`.

Text, reasoning with its signature, tool calls and results, client tools, tool approvals, activity, subagents and stream resume cross in both directions. Shared state goes from a TanStack server to an AI SDK client.
