---
'@tanstack/ai': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-client': patch
'@tanstack/ai-cloudflare': patch
'@tanstack/ai-compaction': patch
'@tanstack/ai-event-client': patch
'@tanstack/ai-harness': patch
'@tanstack/ai-persistence': patch
'@tanstack/ai-sandbox': patch
'@tanstack/ai-sandbox-blaxel': patch
'@tanstack/ai-sandbox-boxd': patch
'@tanstack/ai-sandbox-cloudflare': patch
'@tanstack/ai-sandbox-daytona': patch
'@tanstack/ai-sandbox-docker': patch
'@tanstack/ai-sandbox-e2b': patch
'@tanstack/ai-sandbox-local-process': patch
'@tanstack/ai-sandbox-railway': patch
'@tanstack/ai-sandbox-sprites': patch
'@tanstack/ai-sandbox-upstash-box': patch
'@tanstack/ai-sandbox-vercel': patch
'@tanstack/openai-base': patch
---

Fix recovery, cancel, steer, and provider bugs, and fill small harness gaps.

- Recovery: a resolve that another host recovers runs its continuation. Before, it settled `completed` with no answer.
- Approvals: a tool that a middleware adds in `onConfig` can now be approved. `chat()` checks a durable resume after the whole `onConfig` chain.
- Cancel: a cancelled turn keeps the text it streamed, and ends with `TEXT_MESSAGE_END` and `RUN_FINISHED` (`outcome: cancelled`). A turn that times out ends with `RUN_ERROR` (`code: 'timeout'`).
- Steer: a steer from another sender gets a `queued` receipt with its own operation. `host.events()` shows `idle` after a turn that a steer joined.
- The duplicate-input check no longer depends on the key order of the stored input.
- `TurnInfo` has `model`, `attempt`, and `sender`. The log keeps the sender's `name`. `harness.input.accepted` carries the message. The chat hydration has `pendingWaits`. `ObservedSession.settled()` reads a settlement with no open session. Another host's `snapshot().plugins` shows the saved plugin state.
- New options: `subagents.background: false`, `media.urlTtlMs`, `conversationSummarizer({ middleware })`, and the `beforeWrite` workspace hook, which can refuse a write.
- Plugin model calls (`ctx.model.chat`) run the harness middleware.
- Exports: `SHUTDOWN_REASON`, `BUDGET_REASON`, and `RUN_CANCEL_REASON` from `@tanstack/ai-harness`, `HARNESS_EVENTS` from `@tanstack/ai-harness/client`, and `ChatHydrateOptions` and `ChatHydrationResult` from `@tanstack/ai-client`.
- Compaction drops a background summary that another model prepared.
- Sandbox file calls take an optional `{ signal }`.
- Anthropic: `outputSchema` moves keywords that Anthropic rejects into `description`, usage reports 1-hour cache writes as `cacheWrite1hTokens` again, and `reasoning` on a model with no reasoning entry warns once.
- OpenAI Responses: a message whose model call sent a reasoning item is marked with `metadata.tanstack.reasoningItem`. A replay of that message without its reasoning item no longer sends its `msg_` and `fc_` ids.
- Cloudflare: a `data:` line with no `choices` no longer throws, and the SSE fix-up accepts `data:` with no space, CRLF line ends, and any case in the content type.
- Structured output: a schema failure carries `rawText`, and a parse failure has the code `structured-output-parse-failed`.
- `ChatClient.addToolResult` answers the interrupt when the tool's schemas differ, so the result is sent.
- The persistence conformance suite no longer fails a correct store on a slow runner.
