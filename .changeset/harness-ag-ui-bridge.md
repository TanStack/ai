---
'@tanstack/ai-harness': minor
---

New subpath `@tanstack/ai-harness/ag-ui`: the AG-UI bridge. A harness session already streams AG-UI events, so this is a thin, documented seam for AG-UI clients.

- `sessionEventsToAgUi(events, options?)` normalizes a session's `SessionEvent` stream into a pure AG-UI event stream: run usage is surfaced under `metadata.tanstack.usage` (`normalizeUsage` handles both the AG-UI spec array and the TanStack prompt/completion shapes), interrupt/approval waits stay as `RUN_FINISHED` with `outcome.type === 'interrupt'`, and subagent attribution is preserved. It can optionally drop the harness-native `CUSTOM` control events or emit interim `tanstack.spend` `CUSTOM` ticks for a live spend meter.
- `createAgUiHandler(options)` is a `fetch` handler a bare `@ag-ui/client` `HttpAgent` can point at. `POST` a `RunAgentInput` to run a prompt, or one with `resume` entries to answer the last turn's interrupts. It streams AG-UI events as SSE via `@ag-ui/encoder`'s `EventEncoder` (protobuf framing when the client's `Accept` prefers it). The stream is strict AG-UI by default (harness control events dropped so it begins with `RUN_STARTED`); the harness-native approval path and the relay dashboard are unchanged.

The AG-UI wire is pinned: built and tested against `@ag-ui/core@1.0.0`, `@ag-ui/encoder@1.0.0`, and `@ag-ui/client@1.0.0`.

Generated with Claude Code.
