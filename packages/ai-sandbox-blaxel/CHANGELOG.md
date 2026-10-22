# @tanstack/ai-sandbox-blaxel

## 1.0.0

### Major Changes

- [#1840](https://github.com/TanStack/ai/pull/1840) [`f1b3f65`](https://github.com/TanStack/ai/commit/f1b3f65a59fb75116bd52abbb162cab8c763d10e) - TanStack AI 1.0.0. This release removes every API that was deprecated in 0.x. Read the upgrade guide before you upgrade: https://tanstack.com/ai/latest/docs/migration/v1
  - Removed all `@deprecated` exports, options, fields, and type aliases. Each one has a replacement that already shipped in 0.x.
  - Removed `addToolApprovalResponse()` from `ChatClient` and every chat hook. Resolve the bound `tool-approval` interrupt with `resolveInterrupt` instead. The devtools event `tools:approval:responded` is also removed.
  - Removed the old wire formats: the CUSTOM `approval-requested` and `tool-input-available` events, the `[DONE]` SSE line, the `data` copy of `forwardedProps`, pre-binding interrupt descriptors and their `approval_required` and `client_tool_input` reasons, and the STEP events that adapters sent next to `REASONING_*` events. Use a 1.0 client with a 1.0 server.
  - Removed the `toolName` alias from `TOOL_CALL_START` chunks. Read `toolCallName` instead.
  - `threadId` is now required on `useChat` and every other chat hook, `ChatClient`, the generation hooks and clients, `chat()`, `summarize()`, the generation functions, `codeModeWithSnippets()`, `selectRelevantSnippets()`, `CompactionContext`, and `SummarizeInput`. TanStack AI no longer makes a thread id for you. Pass a stable id for each conversation. `createChatHook` factory options no longer take `threadId`: pass it on each hook call. Octane generation hooks take `threadId` instead of `id`. `@tanstack/ai-sandbox` removes `resolveDurableThreadId` and `DurableThreadIdRequiredError`.
  - The published `@tanstack/ai-octane/ui` types are now strict. `UI.Messages`, `UI.Message`, `UI.Part`, and `UI.Interrupts` type their render children. `ToolProps` types `part.input` and `part.output` for the named tool. `toolsComponents` and `interruptsComponents` are required when the chat options declare tools or named interrupts. Code that relied on the old loose types can fail to compile.
  - A connection adapter's `connect()` and `send()` need the run context (with `threadId`) as their fourth argument. `ChatClient` and the generation clients pass it.
  - `@tanstack/ai-sandbox`: `createToolBridgeCore()`, `startHostToolBridge()`, a `ToolBridgeProvisioner`, and `executeHostTool()` take a required `threadId`. Bridged tools get it in their context.
  - `@tanstack/ai-sandbox`: the harness tool bridge and `executeHostTool()` refuse a tool with `needsApproval`. Before, the tool ran with no approval. Remove `needsApproval`, or run the tool with an HTTP adapter.
  - `stream()` and `rpcStream()` pass the AG-UI `RunAgentInput` for the run as the fourth factory argument, the same body the HTTP adapters send. Read it on the server with `chatParamsFromRequestBody()` or `generationParamsFromBody()`, so `threadId`, `runId`, and interrupt `resume` reach a server function. `RunAgentInput` is exported from `@tanstack/ai/client`.
  - A generation `fetcher` gets `threadId` and `runId` in its second argument, next to `signal` and `headers`. Pass them to the server generation call.
  - `generationParamsFromBody()` and `generationParamsFromRequest()` read the generation input from `forwardedProps`. A server that reads `body.data` gets `undefined`. Read `body.forwardedProps` instead. They also require `threadId` and `runId` and return them as strings, the same as `chatParamsFromRequestBody()` and the AG-UI `RunAgentInput`. A body that holds only the input is rejected.
  - Removed the readers for data saved in old 0.x formats (old Cloudflare run-log records, a bare `UIMessage[]` from client persistence, artifact records without `blobKey`).
  - Removed provider models that are shut down.
  - `@tanstack/ai-react-ui`, `@tanstack/ai-solid-ui`, and `@tanstack/ai-vue-ui` get no 1.0 release. Import from `@tanstack/ai-react/ui`, `@tanstack/ai-solid/ui`, or `@tanstack/ai-vue/ui`.

### Patch Changes

- [#1755](https://github.com/TanStack/ai/pull/1755) [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983) - Fix recovery, cancel, steer, and provider bugs, and fill small harness gaps.
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

- Updated dependencies [[`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`39abb7e`](https://github.com/TanStack/ai/commit/39abb7ed172b4357bc04a39fc6cf7c3577f77cf3), [`f1b3f65`](https://github.com/TanStack/ai/commit/f1b3f65a59fb75116bd52abbb162cab8c763d10e)]:
  - @tanstack/ai-sandbox@1.0.0

## 0.3.1

### Patch Changes

- [#1484](https://github.com/TanStack/ai/pull/1484) [`61231d6`](https://github.com/TanStack/ai/commit/61231d61df2908ef14efd59801d8c0f9b82eb51b) - Add a package README to each sandbox provider: what it isolates with, the factory call, the auth and snapshot/resume behaviour that differs between them, and links to the sandbox docs.

## 0.3.0

### Minor Changes

- [#1358](https://github.com/TanStack/ai/pull/1358) [`a31109f`](https://github.com/TanStack/ai/commit/a31109f4573360c71525513ba7bf2e13fb44c00c) - Use SDK-resolved CLI or client credentials when no API key is supplied. Add lstat metadata without following symlinks and advertise process termination after live conformance validation, with bounded remote reaper completion.

### Patch Changes

- [#1356](https://github.com/TanStack/ai/pull/1356) [`63f5f49`](https://github.com/TanStack/ai/commit/63f5f49cd64ec722cdd0f05b560594be8b59d02b) - Preserve concurrent stdout and stderr when Blaxel log delivery splits records or inserts keepalives. Wait for log attachment before starting the command.

- Updated dependencies []:
  - @tanstack/ai-sandbox@0.5.15

## 0.2.0

### Minor Changes

- [#1065](https://github.com/TanStack/ai/pull/1065) [`c92223a`](https://github.com/TanStack/ai/commit/c92223adad5a5545c40d32734d9df26c62421d37) - Add `@tanstack/ai-sandbox-blaxel`, a sandbox provider backed by managed Blaxel
  sandboxes. It implements the `SandboxProvider` / `SandboxHandle`
  contract: native filesystem reads and writes, `fs.watch()` without polling,
  commands with separate stdout and stderr, live bounded background-process
  output, per-port preview URLs, `env` injection, and resume-by-id. Process stdout
  and stderr are byte-bounded through remotely supervised 8 MiB capture pipelines
  and sent live as fixed-size base64 records, preventing the pinned SDK from
  accumulating unbounded cumulative or newline-free logs while retaining exact
  bytes and the framework's line-stream contract.

  Blaxel's source-scoped snapshot/fork API is currently a private preview, has
  no entitlement probe, and does not document snapshots surviving source deletion.
  The provider therefore keeps the framework's `snapshots`, `fork`, and
  `restoreSnapshot` surface disabled rather than claiming reconstruct-after-delete
  semantics it cannot guarantee.

  Created sandboxes carry a `1h` TTL by default so an abandoned run cannot strand
  a paid sandbox; pass `ttl: null` to manage lifetime yourself. Previews are
  token-gated by default, and the returned channel reports both the token and the
  ready-to-send `X-Blaxel-Preview-Token` header.

  A spawned process reports termination honestly: if `kill()` cannot reap the
  remote process group, `wait()` rejects with that failure instead of resolving
  the kill exit code, so a sandbox that is still running and still billing cannot
  hide behind a clean exit. A stream that already failed is reported for the same
  reason. `fs.write()` creates missing parent directories, and `fork()` throws
  `UnsupportedCapabilityError` rather than being absent.

### Patch Changes

- Updated dependencies [[`53e2ec0`](https://github.com/TanStack/ai/commit/53e2ec082b40d8c3fcd09f408c29f0b895436198)]:
  - @tanstack/ai-sandbox@0.5.7
