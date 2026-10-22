# @tanstack/ai-sandbox-boxd

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

## 0.2.1

### Patch Changes

- [#1607](https://github.com/TanStack/ai/pull/1607) [`7216c7b`](https://github.com/TanStack/ai/commit/7216c7b5813074eafad52028b3d6d7fec1f7d08c) - Delete newly created machines when create or snapshot restore is aborted during readiness or workspace setup.

- Updated dependencies []:
  - @tanstack/ai-sandbox@0.5.18

## 0.2.0

### Minor Changes

- [#1372](https://github.com/TanStack/ai/pull/1372) [`69fbce4`](https://github.com/TanStack/ai/commit/69fbce4d61e8a3a54846d84f460ad1805dda3670) - Add `@tanstack/ai-sandbox-boxd`, a sandbox provider backed by boxd KVM
  microVMs. It implements the `SandboxProvider` / `SandboxHandle` contract:
  file reads and writes through the machine file API, commands with separate
  stdout and stderr and real exit codes, background processes over a streaming
  exec with a writable stdin, one public HTTPS URL per machine through
  `ports.connect`, `env` injection, and resume-by-id across stop, suspend and
  hibernate.

  `snapshot()` captures memory and disk into a boxd snapshot and waits until it
  is restorable, and `restoreSnapshot()` boots a new machine from it with the
  captured processes still running. `fork()` is a live boxd fork: disk, memory
  and running processes, ready in under a second.

  Every machine is created `isolated`, so the agent cannot reach the in-VM
  `boxd` CLI, the metadata endpoint, or other machines in the org. `kill()` is
  measured: the spawn wrapper leads its own process group under `setsid`, and
  the kill shell signals that group and checks that it is gone.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-sandbox@0.5.15
