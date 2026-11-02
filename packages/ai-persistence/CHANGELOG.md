# @tanstack/ai-persistence

## 1.0.1

### Patch Changes

- [#1921](https://github.com/TanStack/ai/pull/1921) [`669fd31`](https://github.com/TanStack/ai/commit/669fd31d995a7134e9f39f386181edc5085039b2) - Persistence adapter skills now type-check, and the Drizzle and custom Postgres recipes run the persistence conformance suite. The custom recipe includes the interrupt and metadata stores. The Prisma recipe is type-checked only, because it needs a generated client.

- [#1918](https://github.com/TanStack/ai/pull/1918) [`2f86841`](https://github.com/TanStack/ai/commit/2f868416cc9d2fe0022f6c08417ed76ddcdadcbd) - The adapter skills now say to write all four chat tables and stores on every dialect. The Drizzle skill gets a full Postgres schema block instead of a prose note, so an agent does not translate the SQLite schema by hand and drop `interrupts` and `metadata`.

  The conformance step in every adapter skill now skips the optional `activities` store, which the testkit requires to be provided or declared. The Drizzle recipe's Postgres and SQLite code was run through the testkit on PGlite and libsql and passes.

- Updated dependencies [[`f085015`](https://github.com/TanStack/ai/commit/f085015da1b77aee3cf95ca74a2e86ed9dbc1c29), [`ae97655`](https://github.com/TanStack/ai/commit/ae976552710726b13b524c307c1b5bbe78478eb0)]:
  - @tanstack/ai@1.0.1

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

### Minor Changes

- [#1755](https://github.com/TanStack/ai/pull/1755) [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983) - Add opt-in session stores. The chat and generation middleware work as before without them.
  - `log` (`LogStore`): an append-only log for each session tree, with 15 methods, each with one object argument. Records: `append`, `read`, and `subscribe`. Ownership: `acquireOwnership`, `renewOwnership`, `releaseOwnership`, `pinToWorkers`, `markHostAlive`, and `listLogsWithoutOwner`. A pin (`pinToWorkers`) counts only while its host is alive: `acquireOwnership` and `listLogsWithoutOwner` ignore the affinity of a host with no live `heartbeat({ hostId, ttlMs })`, so the logs of a host that stopped go to other hosts. A host that is alive keeps its pins, also on the logs that it released. The input lane: `offerInput` and `listOfferedInputs`, consumed in the same write with `append({ consumes })`. The owner or the first offer names the harness of a log for `listLogsWithoutOwner`: a later offer does not change it. Snapshots and lifecycle: `getSnapshot`, `putSnapshot`, `truncate`, and `deleteLog`. `acquireOwnership` returns `expired: true` when it takes the log from another owner whose ownership expired with no release. Each fenced write carries the epoch from `acquireOwnership`, and a write with an old epoch rejects with `OwnershipLostError`. A writer that never calls `acquireOwnership` appends with `NO_OWNER_EPOCH`. `pinToWorkers`, `putSnapshot`, and `truncate` need the owner, so they refuse `NO_OWNER_EPOCH`. After `deleteLog`, every fenced write fails until the next `acquireOwnership`, and `offerInput` returns the new `OfferResult` `'deleted'` and stores nothing, so a late write or input cannot bring a deleted log back. `append` rejects with `LogConflictError` when another writer took the position, and `read` rejects with `LogTruncatedError` before the truncation point. `memoryLogStore()` is the reference store. `memoryLogStore({ state })` with one `memoryLogState()` lets two store instances share one log. The conformance kit needs `twin`, a second store set with a new log store instance on the same backend, for the `log` cases across instances.
  - `sessions` (`SessionIndexStore`): one index entry per tenant and thread. The key is `{ tenantId?, threadId }` (`SessionIndexKey`), so one thread id in two tenants is two entries. An entry has `members` (`SessionMember`, with the role `owner`, `member`, `viewer`, or `operator`). The owner is the member with the role `owner`. The store has `get(key)`, `getVersioned(key)`, `upsert(entry)`, `upsertIf({ entry, revision })` for compare-and-set writes, `list`, and `delete(key)`, a hard delete. `list` reads one tenant, filters by member, parent thread, title `search`, `harness` name, and exact `metadata` values, and pages with a cursor.

  `defineLogStore` and `defineSessionIndexStore` type an adapter. `memoryPersistence()` now also has `log` and `sessions`. `runPersistenceConformance` runs the cases of each session store when the store is present, so an existing backend needs no `skip` entry.

  With `stores.sessions`, `withPersistence` writes one index entry for each subagent child (`subagent:<runId>`), in the tenant of its `tenantId` option. The entry has the parent thread, the tool call, and the `harness` name of the parent entry. It has no members: access to a child goes through its top-level thread.

  `loadChildTranscript(messages, subagentRunId, threadId)` reads the stored messages of a child agent run for a UI. It returns `undefined` for a child of another thread.

- [#1883](https://github.com/TanStack/ai/pull/1883) [`39abb7e`](https://github.com/TanStack/ai/commit/39abb7ed172b4357bc04a39fc6cf7c3577f77cf3) - Core support for the harness: subagent binding options, the `onGuardToolCall` hook, server-side BYOK keys, harness tool runs, checked streamed `outputSchema` results, and resume fixes.

  Add the harness asks from the fifth findings list.
  - `chat({ outputSchema, stream: true })` now checks the full result against a Standard Schema. A failure ends with `RUN_ERROR` `structured-output-validation-failed`, with the model text in `metadata.tanstack.rawText`.
  - `session.send(prompt, { outputSchema })` gives the turn a typed `structured` value. It is per send only, and the HTTP handler does not take it.
  - A server tool reads run capabilities with `context.get(capability)` and `context.getOptional(capability)`, for example the sandbox under `withSandbox`.
  - Readers keep the full history after a durable compaction. `session.transcript()`, `GET transcript`, and the chat hydration show every message. The model still gets the compacted context.
  - `createHarnessHost({ acceptInput })` sees each input after the access check and before the log keeps it. It can change the input or refuse it.
  - A plugin `adapter()` pick with `override: true` wins over the stored thread model.
  - `onModelError` can return `{ retry: true, adapter }` to retry on another model. `ModelErrorContext` has `adapter` and `model`.
  - Middleware reads `ctx.context.run.source` and `label` to tell a turn call from a plugin, router, or transfer call.
  - `host.sessions.archive()` and `unarchive()`. Lists hide archived threads unless you pass `withArchived: true`.
  - `host.sessions.eraseUser({ harness, threadId, userId, replies })` replaces one person's messages with `[removed]`, deletes their media, and cuts the log before a new snapshot. The new `erase` access action guards it.
  - `HarnessRecord` is exported, for a typed `LogStore` wrapper.
  - Coding-tool file calls pass their abort signal through `WorkspaceBackend` to the sandbox.
  - `withCompaction` limits (`maxTokens`, `contextWindow`, `background.atTokens`) can be a function of `{ model }`.

  Run a harness tool with no model turn, add host records from a client, and add a per-run system preamble.
  - `session.runTool({ name, args?, meta?, inputId?, user? })` runs one harness tool with no model
    turn, for example from a schedule or a webhook. The call goes through the
    same middleware, input check, and `permissions()` rules as a model call, and
    the call and its result join the transcript. A tool that asks for approval
    stops the turn with an interrupt. While interrupts wait, the call is refused
    with `pending_interrupts`. `meta` is echoed as a `tanstack.injection` custom
    event. `args` is typed from the input schema of a harness tool.
  - `expose.tools` lists the harness tools a client may run with a
    `{ op: 'tool', name, args?, meta? }` input, or with the new
    `client.runTool({ name, args?, meta?, inputId? })`. The list is typed from the harness
    `tools`, and `defineHarness` throws for a name that is not in `tools`. Any
    other tool is refused with `not_exposed`. The capabilities document marks
    each tool with `exposed`.
  - `expose.records` lists the host record types a client may add with an
    `{ op: 'append', records }` input, or with the new `client.appendRecords({ records })`.
    A record of another type, or with a `thread` field, is refused with
    `not_exposed`. The session log keeps the records.
  - `createHarnessMcpServer` adds a `tool_<name>` tool for each tool in
    `expose.tools`, and an `append` tool when `expose.records` has types. A tool
    input with its own `threadId` field throws when the server is created,
    because MCP uses `threadId` to pick the thread.
  - `session.send(message, { systemPreamble })` prepends per-run, server-only
    system prompts ahead of the harness's own system prompts (for example
    host-provided memory). A client input cannot set them.
  - A tool call in a harness turn gets `threadId` and `runId` in its execution
    context. `ToolExecutionContext` in `@tanstack/ai` has the two new optional
    fields for a host to set.

  A host can add fields to the `ctx` an agent's `run` gets.
  - `subagents.binding.extend(ctx)` returns the fields to add. A child's `ctx.chat({ subagents })` passes it down, so the fields reach nested children too.
  - `SubagentContextExtension` is an empty interface that `SubagentRunContext` includes. A package augments it to type its fields, for example `ctx.harness` from `@tanstack/ai-harness`. Make each field optional, because a run that a plain `chat()` starts has no host.

  Add `interrupts` to `SubagentBinding`.
  - A host sets `binding.interrupts` to give interrupt definitions to every `ctx.chat` call of an agent run. Then the host middleware in `chatMiddleware` can stop the child with these interrupts.
  - The own `interrupts` of the call win. When a host definition has the same id as one of the call, the host definition is not added.
  - A child's `ctx.chat({ subagents })` passes the definitions on to its own children.
  - A plain `chat()` call does not get them.

  Add `lastChatMiddleware` to `SubagentBinding`. It runs after the own middleware of each `ctx.chat` call of an agent run, so it sees the final model context and tool results. A child's `ctx.chat({ subagents })` passes it on, after the child's own.

  Add `validateJsonSchema(schema, value)`. It checks a value against a JSON Schema with `@cfworker/json-schema`, as a tool input is checked, but with no repair. The result has the Standard Schema shape: `{ value }` or `{ issues }`. The root also exports the `StandardSchemaV1` and `StandardJSONSchemaV1` types.

  An agent `run` that throws the shape of `MCPInputRequiredError` (`name`, `kind`, `request`) stops the child as `suspended`, as a tool does, and the parent run stops with its interrupt. The interrupt has a generic binding and no tool call. Its id is the `interruptId` of the thrown value, else `mcp_input_<subagentRunId>`, and its message is the error message. The resume runs the child again, and `ctx.resume` has the answer.

  Add `SubagentBinding.debug`, the `debug` option for the model calls of child agents that set no `debug` of their own.

  Add the `onGuardToolCall` middleware hook for checks that must always run, such as permissions.
  - It runs for every tool call, after all `onBeforeToolCall` hooks and after the `inputSchema` check. `hookCtx.args` holds the final checked arguments that the tool gets.
  - The guard of every middleware runs, in order, until one returns a decision. An earlier `onBeforeToolCall` decision does not skip it.
  - Return `{ type: 'skip', result }` to deny the call. The tool does not run, and the model gets `result`, the same as an `onBeforeToolCall` skip. Return `{ type: 'abort', reason }` to abort the run.
  - It runs before a server tool runs and before a client tool goes to the client. A guard cannot change the arguments.
  - The new `GuardToolCallDecision` type is exported.

  BYOK keys can now live on the server. `@tanstack/ai/byok` exports the `CredentialStore` contract, the `Credential` and `CredentialScope` types, and `defineCredentialStore`. A `CredentialScope` has `tenantId` and `userId`. Its `threadId` is optional, and a store ignores it. `@tanstack/ai/byok/server` adds:
  - `storedProviderKeys(store, scope)`: provider keys from the `api_key` credentials of a user, then of the tenant, then the provider's `env` names. Pass `keys.adapter(...)` to `chat()` and `keys.get` to `subagents.keys`.
  - `readCredential(store, scope, id)`: one credential, the user's own first, then the tenant's. A user with no tenant reads only their own.
  - `tenantScopeOf(scope)`: the tenant scope of a user scope, or `undefined` when the scope has no user or no tenant.
  - `memoryCredentialStore()`: a store in memory, for development and tests.
  - `envKeyEntry(provider)`: the first `provider.env` name that is set, with its value.
  - `readCredentialEntry(store, scope, id)`: reads a credential like `readCredential`. It also tells you which scope had the credential (the user or the tenant), and gives its revision when the store has `getVersioned`.

  `CredentialStore` has two optional methods for compare-and-set writes, `getVersioned` and `setIf`, with the same shape as the pair on `MetadataStore`. A store without them still works. `memoryCredentialStore` has both.

  Keep the store in your own database or in a secrets manager, and encrypt the secrets at rest. An `oauth` credential can keep the OAuth `client` it was issued to. `list` never returns secret values.

  `scrubSecrets` from `@tanstack/ai/byok` now also removes the JSON-escaped and URL-encoded forms of each secret. It skips a secret that is shorter than 6 characters, so a short value does not remove common words.

  `Credential` has a new type, `secret_answer` (`{ value, expiresAt }`). The harness keeps a secret answer to a question there for a short time and deletes it once read. Leave this type out of a list of connected accounts. `memoryCredentialStore().list` returns its `expiresAt`.

  Approved edits to tool arguments stay raw until the final input check.
  - `@tanstack/ai`: a resume no longer rejects approved `editedArgs` that do not fit the tool's `inputSchema`. The edit goes through `onBeforeToolCall` and the final input check, like the model's arguments. If it still does not fit, the approval is used, the tool does not run, and the model gets the input error as the tool result. The transcript keeps the approved edit as it was sent, but only when the call passed the check.
  - `@tanstack/ai-persistence`: `withPersistence` binds the client-tool phase of an approved tool call to its approval. After a restart, the client result resumes with the approval that came before it, and a stale or missing approval fails the resume.

  A nested subagent that waits on an interrupt now continues after the resume under `withPersistence`. Before, it ran again from its prompt. Core rebuilds the card of the nested child from the store and takes only its id from the client card. `LoadChild` takes an optional `parentSubagentRunId`, and returns `interruptIds` and `parentToolCallId`.

  `chat()` asks the middleware `onShouldContinue` after it runs the pending tool calls of a resume, before the next model call. A middleware that returns `false` there ends the run with no more model calls. The loop strategy is not asked at that point.

  `WebSocketLike` has an optional `bufferedAmount`. A server can read it to stop sending to a slow socket. A socket without it works as before.

### Patch Changes

- [#1847](https://github.com/TanStack/ai/pull/1847) [`d3b4cd4`](https://github.com/TanStack/ai/commit/d3b4cd4965552f35273b9c96823ad657af1fe0b5) - Report the conformance cases of an omitted `generationRuns`, `artifacts`, or `blobs` store as skipped. These cases reported a pass when the store was declared in `skip`.

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

- [#1875](https://github.com/TanStack/ai/pull/1875) [`f6a27bc`](https://github.com/TanStack/ai/commit/f6a27bc33198bff58415dfe8d107f1d5b9525e83) - `withPersistence` now saves activity rows when a run is stopped or fails, so `reconstructChat` restores them after a reload. A plain disconnect on a detachable or interrupted run still writes nothing.

- [#1805](https://github.com/TanStack/ai/pull/1805) [`7a0a48b`](https://github.com/TanStack/ai/commit/7a0a48bac8b531a90e768c87cb645da2fc8d3f31) - Middleware can read `ctx.callMetadata`, the `metadata.tanstack` of the current model call. Each assistant message of the call gets a copy of it.

  With `snapshotStreaming`, `withPersistence` now stores `ctx.callMetadata` on snapshot rows, so a stopped or failed row has the same metadata as a finished one. A stopped or failed row no longer stores other chunk metadata, such as the durability batch hint of `ctx.emitCustomEvent(name, value, { batch: true })`.

- [#1806](https://github.com/TanStack/ai/pull/1806) [`468063c`](https://github.com/TanStack/ai/commit/468063c07cd904be97b154b415163c23510834b2) - Fix `withPersistence` failing to resume an interrupt of a subagent tool call with `Tool <name> is unavailable for interrupt <id>.` The parent run now leaves interrupts its child answers to the child, using the new `ctx.childResumeIds` on the middleware context, and still commits them once the run succeeds.

  With `withPersistence`, the resume of a child is server-authoritative:
  - The stored interrupt records decide which interrupts a child owns. A resume whose subagent cards claim other interrupts fails with `InterruptResumeValidationError`.
  - The child resumes from its stored messages, not from the card the client sent back. `LoadChild` results get an optional `pending` field for this. A middleware that provides `loadChild` must set `pending` for a waiting child, or the agent tool does not resume it.

- [#1755](https://github.com/TanStack/ai/pull/1755) [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983) - Keep the answer of a routed agent in its own message when the turn resumes after an interrupt and a finished tool call (for example a handoff) comes before that answer. Before, the stored answer moved onto the message of the tool call.

- [#1755](https://github.com/TanStack/ai/pull/1755) [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983) - `withPersistence` lets a subagent that a tool call started check the answers to its own interrupts. The parent run does not check them against its own tools and batch, so a child client tool, and two children that wait at once, resume.

- Updated dependencies [[`fcbd199`](https://github.com/TanStack/ai/commit/fcbd199a66b553acef0b81bc76c4b4acd7fde6a9), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`959f43e`](https://github.com/TanStack/ai/commit/959f43e4b11112f2c097f642bdec34d8d0f83e27), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`fa2a291`](https://github.com/TanStack/ai/commit/fa2a291f5526f6dec9a91fe5b71de15dfaf59ec7), [`f7e7cce`](https://github.com/TanStack/ai/commit/f7e7cce8f2d543a7480b626b7985417e054bfd8d), [`7a0a48b`](https://github.com/TanStack/ai/commit/7a0a48bac8b531a90e768c87cb645da2fc8d3f31), [`468063c`](https://github.com/TanStack/ai/commit/468063c07cd904be97b154b415163c23510834b2), [`fe83aa0`](https://github.com/TanStack/ai/commit/fe83aa05fe2346c50693664d4a4896d4fc1fea5a), [`781a3a8`](https://github.com/TanStack/ai/commit/781a3a82c870e246deff23c7aca32094e9aaaf2f), [`39abb7e`](https://github.com/TanStack/ai/commit/39abb7ed172b4357bc04a39fc6cf7c3577f77cf3), [`f1b3f65`](https://github.com/TanStack/ai/commit/f1b3f65a59fb75116bd52abbb162cab8c763d10e)]:
  - @tanstack/ai@1.0.0
  - @tanstack/ai-utils@1.0.0

## 0.10.1

### Patch Changes

- Updated dependencies [[`824ee98`](https://github.com/TanStack/ai/commit/824ee98060983dd2b5728f288cecefa6a1250325)]:
  - @tanstack/ai@0.71.0

## 0.10.0

### Minor Changes

- [#1723](https://github.com/TanStack/ai/pull/1723) [`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555) - Continue a child. With `withPersistence` on the parent `chat()`, an agent tool result gives the model the child's `subagentRunId`, and a later call of the same agent tool with `sessionId` continues that child from its stored transcript. With a host that sets `subagents.binding.start`, `background: true` starts the child and returns at once. These fields sit next to the agent's own fields, and each agent tool has them only when the run can use them. When the run uses `sessionId` or `background`, that name is reserved: `chat()` throws when an agent's `inputSchema` uses it. An agent without `inputSchema` takes the task as text in `prompt`, and the child gets it as the last user message. Agent tools also support the `detach` field of the tool context.

  The card keeps the checked input of an agent with `inputSchema`. On the client, `part.subagent.input` has it, typed from `inputSchema` when the agent declaration goes to `useChat({ subagents })`.

  `@tanstack/ai` adds `LoadChildCapability`, `getLoadChild`, and `provideLoadChild`, so a persistence middleware can load a stored child. A provider lists `LoadChildCapability` in `provides`. `withPersistence` in `@tanstack/ai-persistence` provides it: it stores the task of each child's first call and the thread that started it, and loads only the children of the calling thread.

### Patch Changes

- [#1723](https://github.com/TanStack/ai/pull/1723) [`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555) - A subagent can now return a plain value and call any activity.
  - `defineAgent`'s `run` can return a promise of any value, such as an image result. The value arrives on `SUBAGENT_FINISHED.result`, and the parent model gets it as the tool result. A very long string inside an object result (for example a base64 image) reaches the parent model as a short note (`compactForModel`). A string result also streams as the child's text. The result of `ctx.chat({ stream: false })` streams like the chat stream.
  - `run` gets the activities on `ctx` (`ctx.chat`, `ctx.generateImage`, `ctx.generateVideo`, and the rest), which fill in the thread id, a run id, and the abort signal. `ctx.forward` holds the fields for a plain `chat()` call. The optional `produces` field says what an agent makes.
  - A host can set `subagents.binding` (`SubagentBinding`) to add chat and generation middleware to every activity call of a child. A child's `ctx.chat({ subagents })` passes it down to its own children.
  - Children inherit the prompt cache retention of the parent call.
  - The chat middleware context has `subagentName` and `parentSubagentRunId`. `chat()` takes both as options.
  - `RunRecord` gets optional fields for host sessions (`kind`, `activity`, `agent`, `result`, `artifacts`, `principal`, `leaseOwner`, `leaseExpiresAt`, `checkpoint`). The memory run stores keep them.

- [#1744](https://github.com/TanStack/ai/pull/1744) [`29bb0a4`](https://github.com/TanStack/ai/commit/29bb0a487f8b8febebcbd891bead0ab7aa3ba987) - Store a tool result once when a run resumes from a client-tool interrupt. The client posts earlier tool results under interrupt snapshot ids the store never saw, so `withPersistence` appended a second copy and the next provider request failed.

- [#1786](https://github.com/TanStack/ai/pull/1786) [`30fa651`](https://github.com/TanStack/ai/commit/30fa651d173e519db8de50c9f888ded71b951640) - Fix subagent limit and continue edges.
  - A background `start` that throws gives the `maxCalls` slot back. `maxConcurrent` counts that child until `done` settles. `start` now returns `done`.
  - A schema result that is not an object does not drop `sessionId` or `background`. A top-level `anyOf` schema still shows those fields.
  - A suspended child with no stored `base` keeps its transcript.
  - When the parent deadline is already past, the model gets `subagent limit reached (no time left)`.

- Updated dependencies [[`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555), [`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555), [`5f95dbd`](https://github.com/TanStack/ai/commit/5f95dbd08f2780442000ac52074ea747d1b44187), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b), [`3292bad`](https://github.com/TanStack/ai/commit/3292bad7b26990c5aa4676cc9d9fe33b1741fc1a), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b), [`4298480`](https://github.com/TanStack/ai/commit/429848047c8c514f29855f8a99a7260253eb5d5b), [`f68da51`](https://github.com/TanStack/ai/commit/f68da51f63f999b70ac7aaf5aebc0109a7e9daf7), [`85c2956`](https://github.com/TanStack/ai/commit/85c2956c68f3226ef409b3a4e54d5be82198931e), [`30fa651`](https://github.com/TanStack/ai/commit/30fa651d173e519db8de50c9f888ded71b951640), [`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b)]:
  - @tanstack/ai@0.70.0
  - @tanstack/ai-utils@0.5.0

## 0.9.0

### Minor Changes

- [#1715](https://github.com/TanStack/ai/pull/1715) [`fac0555`](https://github.com/TanStack/ai/commit/fac055559de98eb0fa23a0bc725808033ba3c2fc) - New hooks for hosts that run `chat()` for a long session.
  - `@tanstack/ai` exports `runAgentStream` (runs a `defineAgent` agent outside a parent chat turn), `createSubagentId`, `createSubagentSink`, `CapabilityRegistry`, and the `SubagentsBag` and `SubagentSink` types. Pass the sink to keep interrupt objects and token usage. The finished event has `interruptIds` only.
  - `MetadataStore` has optional `getVersioned` and `setIf` for compare-and-set writes. The memory store of `@tanstack/ai-persistence` has both, and the conformance testkit checks them.
  - `toolDefinition({ replay: 'safe' | 'never' })` tells a host if it can run the tool again after a crash.
  - The tool context has an optional `detach` field. A host sets it when it can move the call to the background. A tool passes its work to `detach` and races the two promises.
  - A tool that throws the MCP input-required shape can set the interrupt `reason`. The default is `'mcp_input'`. The interrupt id stays `mcp_input_<toolCallId>`.

### Patch Changes

- [#1697](https://github.com/TanStack/ai/pull/1697) [`cef1911`](https://github.com/TanStack/ai/commit/cef19119c76fc5f618d6c971efbc486323b213c3) - A message store now keeps the mid-conversation change record of an assistant message when a client sends the same message again without it. With `useChat`, the prompt cache then holds across turns on models that get tool and prompt changes inside the conversation.

- [#1698](https://github.com/TanStack/ai/pull/1698) [`1bfcee3`](https://github.com/TanStack/ai/commit/1bfcee35bb3cf0ff3aac005440c842e66c3d687d) - Keep a conversation valid when the next request goes to a different model.
  - Each assistant message records `metadata.tanstack.source` (`{ provider, api, model }`), and `responseId` and the resolved `model` when the provider sends them. A failed or aborted answer gets `stopReason: 'error'` or `'aborted'`. `RUN_FINISHED` has a new `responseId` field. `TextAdapter` has new optional `provider` and `api` fields.
  - When the next request goes to a different source, the adapter removes signatures and redacted thinking, turns readable thinking into text, and rewrites tool call IDs to the shape the target API accepts. Each call stays paired with its result.
  - Every request drops failed and aborted assistant batches and adds a `No result provided` result for an unanswered tool call. The saved history does not change.
  - `RUN_FINISHED` and `RUN_ERROR` metadata now merge onto the assistant messages of that model call in `StreamProcessor`.
  - Anthropic: the new `allowEmptySignature` option (default `false`) replays unsigned thinking from the same source, for gateways. The new `provider` option names a gateway.
  - Azure OpenAI reports the `azure-openai-responses` API.
  - Gemini, Mistral, and Bedrock Converse send same-source thinking back to the model, in block order.
  - `withPersistence` writes the source and the stop reason onto streaming snapshot rows.
  - Adapter authors get `transformMessagesForReplay()` and `hashToolCallId()` from `@tanstack/ai/adapter-internals`.

- Updated dependencies [[`1bfcee3`](https://github.com/TanStack/ai/commit/1bfcee35bb3cf0ff3aac005440c842e66c3d687d), [`412b0fe`](https://github.com/TanStack/ai/commit/412b0fea4f4bb569998c3d253d174efd7b501e3c), [`a0150c2`](https://github.com/TanStack/ai/commit/a0150c26b9e2b6050663450171e36a9dfa80915b), [`b881627`](https://github.com/TanStack/ai/commit/b881627d51076dcc1af031ac951046e2fb7d84c4), [`fac0555`](https://github.com/TanStack/ai/commit/fac055559de98eb0fa23a0bc725808033ba3c2fc), [`6774e80`](https://github.com/TanStack/ai/commit/6774e803da3205101613ab2857c9ed4fbf975681), [`5bd27f2`](https://github.com/TanStack/ai/commit/5bd27f2fc94ebfb6d11bfb28d46d5d858310805e), [`c20f7b0`](https://github.com/TanStack/ai/commit/c20f7b021aa618fbfcc114b3f0bef5e888ff6b84), [`cef1911`](https://github.com/TanStack/ai/commit/cef19119c76fc5f618d6c971efbc486323b213c3), [`51f72fb`](https://github.com/TanStack/ai/commit/51f72fbf60e201f9c8d014aefa6406e777c05d6a), [`6f1e559`](https://github.com/TanStack/ai/commit/6f1e55934fe95ddf2bf3fb3031488a713e48c7af), [`eb4eea0`](https://github.com/TanStack/ai/commit/eb4eea05b6c53b748bba5fd414b04ce387ead05d), [`cef1911`](https://github.com/TanStack/ai/commit/cef19119c76fc5f618d6c971efbc486323b213c3), [`7532b2b`](https://github.com/TanStack/ai/commit/7532b2b09188ebd1095a60a7c5df6ef08b06916c), [`1bfcee3`](https://github.com/TanStack/ai/commit/1bfcee35bb3cf0ff3aac005440c842e66c3d687d), [`78edeb2`](https://github.com/TanStack/ai/commit/78edeb20a5ba89f2513c3f46f1267a7ed7185045), [`44e3a0a`](https://github.com/TanStack/ai/commit/44e3a0a89c86defebd38b2221dd3b7725a12839a), [`7532b2b`](https://github.com/TanStack/ai/commit/7532b2b09188ebd1095a60a7c5df6ef08b06916c), [`7a5c0d6`](https://github.com/TanStack/ai/commit/7a5c0d6fc1541187a7f01b444bc07a0478274bcb), [`b881627`](https://github.com/TanStack/ai/commit/b881627d51076dcc1af031ac951046e2fb7d84c4)]:
  - @tanstack/ai@0.69.0
  - @tanstack/ai-utils@0.4.2

## 0.8.3

### Patch Changes

- Updated dependencies [[`723b4a4`](https://github.com/TanStack/ai/commit/723b4a4e8432825374d4980cc74c5f66dc7d1122), [`d84a49e`](https://github.com/TanStack/ai/commit/d84a49e5fef03499b10f63255880d056a55767a3)]:
  - @tanstack/ai@0.68.0

## 0.8.2

### Patch Changes

- Updated dependencies [[`7dbfaf6`](https://github.com/TanStack/ai/commit/7dbfaf6c37a3d97de3b1f5bdb87be8bbbe2b0164), [`88fd67c`](https://github.com/TanStack/ai/commit/88fd67cd7ddfbe2b154173d2395b2c0338e97644), [`3aa2e3d`](https://github.com/TanStack/ai/commit/3aa2e3d95e2dcb1c14b4fda3bcdbdf3152582092), [`c5ae415`](https://github.com/TanStack/ai/commit/c5ae4152d0a040bb6ce7321e16b7ee66d3c36f96), [`13ba1b0`](https://github.com/TanStack/ai/commit/13ba1b0e47dc822f10f6c5133184f92c2eb0a013), [`377262c`](https://github.com/TanStack/ai/commit/377262c0b4e5f59f8fd467a831b9341cc705077e)]:
  - @tanstack/ai@0.67.0

## 0.8.1

### Patch Changes

- [#1622](https://github.com/TanStack/ai/pull/1622) [`bfe9d33`](https://github.com/TanStack/ai/commit/bfe9d33a30b6311c3392cdf402dd48aef3fba3b3) - Keep the error of a stopped or failed subagent card after a reload. `reconstructChat` now reads the error from the stored child metadata, so a stopped child keeps its `Stopped` error and a failed child keeps its error `code`.

- Updated dependencies [[`f687c54`](https://github.com/TanStack/ai/commit/f687c54ae4b8a67f2154ff9dea0319b8d2712856), [`fb55bcb`](https://github.com/TanStack/ai/commit/fb55bcba5193d4465f43006505918a2dc4472ec4), [`630ec86`](https://github.com/TanStack/ai/commit/630ec86e9997fabe046cae1a491060d72cbc71ea)]:
  - @tanstack/ai@0.66.0

## 0.8.0

### Minor Changes

- [#1323](https://github.com/TanStack/ai/pull/1323) [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66) - Add an optional ActivityStore sidecar so server persistence can save and reconstruct AG-UI activity without putting it in MessageStore.

  Activity saves are best-effort. They run after the message, run, and interrupt writes, so a failed activity save does not fail the run. `ActivityRecord` keeps the activity `metadata`. A paged `reconstructChat` puts each activity on the one page that holds it. A reload drops the activity rows of the turn it replaces.

  Migration: an adapter that runs `runPersistenceConformance` must provide an `activities` store or pass `skip: ['activities']`.

### Patch Changes

- [#1541](https://github.com/TanStack/ai/pull/1541) [`30254ad`](https://github.com/TanStack/ai/commit/30254ad70161894d232d3b45e3b21f45d49f336e) - Video adapters can hand a provider's download stream to generation persistence instead of buffering it. Adapters now implement `getVideo()`. When a provider has no public URL for the finished video (OpenRouter, Lovable, Sora jobs without `url`), it returns a `VideoStreamResult` (`{ body, contentType }`), and `withGenerationPersistence` streams it into your blob store and sets `url` from `artifactUrl`.

  Nothing changes without persistence: `getVideoJobStatus()` and streaming `generateVideo()` still return a base64 `data:` URL for those providers.

  `VideoAdapter.getVideoUrl()` is deprecated in favor of `getVideo()`. It still works: on the built-in adapters it is `getVideo()` with a stream buffered into a `data:` URL, and custom adapters that only implement `getVideoUrl()` keep working. A custom adapter that extends `BaseVideoAdapter` with TypeScript's `noImplicitOverride` must add `override` to its `getVideoUrl()`, or rename it to `getVideo()`.

- Updated dependencies [[`7b6b1a9`](https://github.com/TanStack/ai/commit/7b6b1a99d45e40165f0a1f833a04e793a09275de), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`82291b2`](https://github.com/TanStack/ai/commit/82291b22941d2c813ff0050fc9d41b024480153d), [`ff3a66e`](https://github.com/TanStack/ai/commit/ff3a66ed8f628d45b282316fab337d3ed19f34cd), [`560c76f`](https://github.com/TanStack/ai/commit/560c76fd638b5691e195e1d0619fee8a78d98c20), [`4b9dcb4`](https://github.com/TanStack/ai/commit/4b9dcb44d8fe1e7c933b79c23d8f072e7bc300f4), [`30254ad`](https://github.com/TanStack/ai/commit/30254ad70161894d232d3b45e3b21f45d49f336e), [`40fdd22`](https://github.com/TanStack/ai/commit/40fdd22ce05d55e71514b4cc80b1c28cefb4a431)]:
  - @tanstack/ai@0.65.0

## 0.7.2

### Patch Changes

- [#1590](https://github.com/TanStack/ai/pull/1590) [`0d5b2ea`](https://github.com/TanStack/ai/commit/0d5b2ea24fdac399cf3b9a7826c0fa93178b4d56) - Update the Redis guidance in the `ai-persistence/build-custom-adapter` skill: keep `runs` and `interrupts` indexes in sorted sets written by one Lua script together with the record, instead of advising against Redis for interrupts.

- Updated dependencies [[`3a09cf0`](https://github.com/TanStack/ai/commit/3a09cf04431a45810051ea5df6bb3935af421ddb), [`ee726f5`](https://github.com/TanStack/ai/commit/ee726f537dbb036d5edb756b92739afaa7573824), [`a5fce7f`](https://github.com/TanStack/ai/commit/a5fce7f95b8b9c6eb57697aa1e3f587bf27483b9), [`94116ad`](https://github.com/TanStack/ai/commit/94116ad137015b6f62fe62b4c06a335dbde36a49)]:
  - @tanstack/ai@0.64.0

## 0.7.1

### Patch Changes

- [#1233](https://github.com/TanStack/ai/pull/1233) [`8e8ee26`](https://github.com/TanStack/ai/commit/8e8ee26959a471bb6fac180ded3a9a048ae93609) - Preserve failed client tool results across native interrupt resumes and await asynchronous client output validation

- Updated dependencies [[`37b2826`](https://github.com/TanStack/ai/commit/37b282655ea9c780e9793ef33013d64b1bf88625), [`8e8ee26`](https://github.com/TanStack/ai/commit/8e8ee26959a471bb6fac180ded3a9a048ae93609), [`c5c1996`](https://github.com/TanStack/ai/commit/c5c19961b8c98497fd88ae93c5d6330d7b2ecb6a), [`3e30cde`](https://github.com/TanStack/ai/commit/3e30cde8ae7f5be7be3bc9c4f30c842159fc7edf), [`0eb8f0b`](https://github.com/TanStack/ai/commit/0eb8f0b7f4ffa0133a814f8fcfccbc1acedd7488), [`f44b6b2`](https://github.com/TanStack/ai/commit/f44b6b22578b893501e05612f02ea1aaee0951d3), [`d632d41`](https://github.com/TanStack/ai/commit/d632d41df227bf11bc3cdbf5542823f87562b3d4)]:
  - @tanstack/ai@0.63.0

## 0.7.0

### Minor Changes

- [#1504](https://github.com/TanStack/ai/pull/1504) [`5099a32`](https://github.com/TanStack/ai/commit/5099a32cbfb6c77e335769793415fe7e90bb17d8) - Show how long each turn took after a reload.
  - `withPersistence` records the run that produced each assistant message on `metadata.tanstack.run.id`.
  - `reconstructChat(persistence, request, { includeRuns: true })` adds the finished run's `startedAt` and `finishedAt` to `metadata.tanstack.run` on those messages, and returns a top-level `runs` list. It needs a `runs` store that implements `listByThread`.
  - `uiMessageToModelMessages` and `uiMessagesToWire` keep `metadata.tanstack.run.id`, so the tag survives the round trip from the client.
  - `runPersistenceConformance` has a new `checks` option with two opt-in checks: `'messages.metadata'` and `'runs.listByThread.state'`. They are off by default, so an adapter that passed before still passes.

### Patch Changes

- Updated dependencies [[`a450d00`](https://github.com/TanStack/ai/commit/a450d007a039610994342dd9c3387f880a4eb992), [`c54e20c`](https://github.com/TanStack/ai/commit/c54e20cf5be8e1f73e0be661e242391fa0e4633e), [`a56192e`](https://github.com/TanStack/ai/commit/a56192eafa0da2ccca2d576dc4371b196355c605), [`740ae66`](https://github.com/TanStack/ai/commit/740ae6664d358f00deddf72319ef947fe3bb0935), [`5099a32`](https://github.com/TanStack/ai/commit/5099a32cbfb6c77e335769793415fe7e90bb17d8), [`820429f`](https://github.com/TanStack/ai/commit/820429fa9bea8ba220cf073406760475ac07b112), [`0abae97`](https://github.com/TanStack/ai/commit/0abae97f94fe4d37523f8a6427972ae7fe3b7fde), [`8c68c2d`](https://github.com/TanStack/ai/commit/8c68c2d9750bcc818201089bbbb7d90aa26d99a1)]:
  - @tanstack/ai@0.62.0

## 0.6.7

### Patch Changes

- Updated dependencies [[`54d39d3`](https://github.com/TanStack/ai/commit/54d39d30704bbdbdccea756af31530cc6713fc2e), [`2d047c5`](https://github.com/TanStack/ai/commit/2d047c5cf5f25c244c05f0cb0e816b9634616fbb), [`74b5823`](https://github.com/TanStack/ai/commit/74b582305471eaf37a3b68595e60ed1a6f42d914), [`abb0169`](https://github.com/TanStack/ai/commit/abb0169bf96c38f59791450ce060d089a7fcd26e), [`ed87986`](https://github.com/TanStack/ai/commit/ed87986069bcfe42a51cedf1365cc10662b0e088), [`a0f7c14`](https://github.com/TanStack/ai/commit/a0f7c14a9d9a4b2e72e87b976f46d193deb5921b)]:
  - @tanstack/ai@0.61.0

## 0.6.6

### Patch Changes

- Updated dependencies [[`ef0a00f`](https://github.com/TanStack/ai/commit/ef0a00f09059abfd9e96eb1367e8ff0280458abd)]:
  - @tanstack/ai@0.60.0

## 0.6.5

### Patch Changes

- [#1438](https://github.com/TanStack/ai/pull/1438) [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0) - A subagent run record stores `parentRunId`, `subagentRunId`, and `name`. Each child keeps its full transcript: text, reasoning, tool calls, and tool results. `reconstructChat` uses `listByParentRun` to put each child card back, with nested children and a child that waits for an approval. A later message keeps that link, so the next agent still sees the child text.

  Subagent support in a store is optional. `runPersistenceConformance` checks the three link fields and `listByParentRun` only when the store has `listByParentRun`. A store without it passes with no change and no `skipMethods` entry.

- Updated dependencies [[`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0)]:
  - @tanstack/ai@0.59.0

## 0.6.4

### Patch Changes

- Updated dependencies [[`796f2b5`](https://github.com/TanStack/ai/commit/796f2b5f7c05debe251ad3ecd4073d8cd119b3db)]:
  - @tanstack/ai@0.58.0

## 0.6.3

### Patch Changes

- [#1434](https://github.com/TanStack/ai/pull/1434) [`dd1f8e2`](https://github.com/TanStack/ai/commit/dd1f8e2431f2f4fd7804ff74cea90e21cb2bd2b7) - Add a package README: install, `withPersistence` on the server, `persistence: true` on the client, `reconstructChat` for reloads mid-answer, the smallest custom adapter, the `testkit` conformance suite, and links to the docs.

- Updated dependencies [[`8bcfb88`](https://github.com/TanStack/ai/commit/8bcfb883bf7447c84cc0148bf838e9324dc5f1d3)]:
  - @tanstack/ai-utils@0.4.1

## 0.6.2

### Patch Changes

- Updated dependencies [[`04bfd8c`](https://github.com/TanStack/ai/commit/04bfd8c26ce337cca53f3f8d286f14ed0432a329), [`254ab5f`](https://github.com/TanStack/ai/commit/254ab5ff5b0a9ca945cb313588f4b56394c7ecf7)]:
  - @tanstack/ai@0.57.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`7c4b25e`](https://github.com/TanStack/ai/commit/7c4b25ebefc64e4f209c282788f515939eca02e9), [`f60f736`](https://github.com/TanStack/ai/commit/f60f73612dd7621e2f1ad76abb1a640307dea3c6)]:
  - @tanstack/ai@0.56.0

## 0.6.0

### Minor Changes

- [#1400](https://github.com/TanStack/ai/pull/1400) [`0945a79`](https://github.com/TanStack/ai/commit/0945a79b0923b31a5122d0bf28c115879341a410) - Page long chat threads on hydrate. Pass `history: { pageSize }` with `persistence: true`. Then call `loadOlderMessages()` to prepend older turns. `withPersistence` merges incoming messages by id so a short client list keeps stored extras. `loadThread` accepts optional `limit` / `before` and can return a `MessagePage`.

### Patch Changes

- Updated dependencies [[`fa13446`](https://github.com/TanStack/ai/commit/fa13446fab9b9048de9433a5ebf55bc626f5fd74), [`0945a79`](https://github.com/TanStack/ai/commit/0945a79b0923b31a5122d0bf28c115879341a410)]:
  - @tanstack/ai@0.55.0

## 0.5.7

### Patch Changes

- [#1350](https://github.com/TanStack/ai/pull/1350) [`53e2ec0`](https://github.com/TanStack/ai/commit/53e2ec082b40d8c3fcd09f408c29f0b895436198) - docs(skills): type-check the code fences in every package skill with kiira and fix the ones that did not compile

- Updated dependencies [[`c17bc95`](https://github.com/TanStack/ai/commit/c17bc951ca783d8023bf54d69035c19c0c72ea2f), [`53e2ec0`](https://github.com/TanStack/ai/commit/53e2ec082b40d8c3fcd09f408c29f0b895436198), [`6269eff`](https://github.com/TanStack/ai/commit/6269eff90e770205ffd9cae8c5989b8ff02b57ce)]:
  - @tanstack/ai@0.54.0

## 0.5.6

### Patch Changes

- Updated dependencies [[`21775ee`](https://github.com/TanStack/ai/commit/21775ee2d23dd594cdc184678ff587341bd74871)]:
  - @tanstack/ai@0.53.0

## 0.5.5

### Patch Changes

- [#1252](https://github.com/TanStack/ai/pull/1252) [`a4ab03e`](https://github.com/TanStack/ai/commit/a4ab03e213dcda2cd1120c9e7bf4824650996fae) - Stop a late detach stamp from leaving a completed run looking detached after takeover.

## 0.5.4

### Patch Changes

- [#1235](https://github.com/TanStack/ai/pull/1235) [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7) - Keep canonical chat history separate from compacted provider context. Reuse
  validated compaction checkpoints through an optional persistence metadata store.
- Updated dependencies [[`49fc54c`](https://github.com/TanStack/ai/commit/49fc54ca0aacf2fc60bb36647a61a23559dda4bc), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7)]:
  - @tanstack/ai@0.52.0

## 0.5.3

### Patch Changes

- Updated dependencies [[`5dc4e1a`](https://github.com/TanStack/ai/commit/5dc4e1a08728b410f85956093ccef621d12b4d6b), [`a7e0798`](https://github.com/TanStack/ai/commit/a7e079872af372496728d25e6ec23149cd5e04b9), [`6a083bf`](https://github.com/TanStack/ai/commit/6a083bfcfaa4fd0c83368c4d10067e5c2298e22c)]:
  - @tanstack/ai@0.51.0

## 0.5.2

### Patch Changes

- [#1204](https://github.com/TanStack/ai/pull/1204) [`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b) - Preserve AG-UI message fields and UI state across serialization, snapshots, and persistence.

- Updated dependencies [[`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b), [`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b)]:
  - @tanstack/ai@0.50.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`b7ebcb0`](https://github.com/TanStack/ai/commit/b7ebcb0bbe63e425facb5e38f138bd0cd36637dd)]:
  - @tanstack/ai@0.49.0

## 0.5.0

### Minor Changes

- [#1174](https://github.com/TanStack/ai/pull/1174) [`1c0415b`](https://github.com/TanStack/ai/commit/1c0415bec4bbefcd3abf784d0209af05aca5db46) - Put AG-UI extras under `metadata.tanstack`. SSE/HTTP wire events are spec-only.

  `sendMessage({ content, metadata })` stamps user metadata on the user message.
  In-process `chat()` still yields `toolName`, `TOOL_CALL_END.input`, and TanStack `TokenUsage`.
  Thinking signatures round-trip on `REASONING_ENCRYPTED_VALUE`.
  Wire messages use `content` / `toolCalls` / fan-out roles, not `parts`.

### Patch Changes

- Updated dependencies [[`1c0415b`](https://github.com/TanStack/ai/commit/1c0415bec4bbefcd3abf784d0209af05aca5db46)]:
  - @tanstack/ai@0.48.0

## 0.4.1

### Patch Changes

- [#1175](https://github.com/TanStack/ai/pull/1175) [`17b4c60`](https://github.com/TanStack/ai/commit/17b4c60c8d237df53a63dcda18c43d8017d45449) - Route adapter-emitted `RUN_ERROR` events through middleware `onError` hooks and preserve provider error codes in persisted run failures.

- Updated dependencies [[`17b4c60`](https://github.com/TanStack/ai/commit/17b4c60c8d237df53a63dcda18c43d8017d45449)]:
  - @tanstack/ai@0.47.2

## 0.4.0

### Minor Changes

- [#1108](https://github.com/TanStack/ai/pull/1108) [`9b5f841`](https://github.com/TanStack/ai/commit/9b5f841127743ed73fbdaa96038c9b45314e0db9) - Add complete thread artifact history for portable sandbox snapshots.

### Patch Changes

- [#1126](https://github.com/TanStack/ai/pull/1126) [`47699ed`](https://github.com/TanStack/ai/commit/47699ed1bf0c21a3835f012fe95f9dd8f089e41d) - Persist completed structured outputs as structured-output message parts and restore them during chat hydration.

- Updated dependencies [[`47699ed`](https://github.com/TanStack/ai/commit/47699ed1bf0c21a3835f012fe95f9dd8f089e41d)]:
  - @tanstack/ai@0.47.1

## 0.3.0

### Minor Changes

- [#1102](https://github.com/TanStack/ai/pull/1102) [`32e62ab`](https://github.com/TanStack/ai/commit/32e62ab8b7dc6a8a13ca3851c8925ab806e08f29) - Add first-party generic interrupts.

  Use `defineInterrupt()` to describe a pause, register it on `chat()` and the client hooks, and return requests from `onInterruptBoundary`. The client gets typed payloads and `resolveInterrupt`. Resume validates the answer and runs `onInterruptResolution`.

  `GenericInterrupt<typeof reviewPlan>` types one bound card. `INTERRUPT_BOUNDARY_PHASES` and `INTERRUPT_TOOL_RESUMES` are the shared phase and resume lists.

### Patch Changes

- [#1161](https://github.com/TanStack/ai/pull/1161) [`5f68cbc`](https://github.com/TanStack/ai/commit/5f68cbccf3621b48dae73cedcb1e59cb4cbe72b4) - Harden first-party generic interrupt resume.

  Ephemeral continuation now rehydrates an already-parsed display payload instead of running `payloadSchema` again, so transforming schemas keep working. Invalid `expiresAt` values fail closed, binding parse uses one reader, and sequential interrupt-store writes preflight before changing records.

- Updated dependencies [[`5f68cbc`](https://github.com/TanStack/ai/commit/5f68cbccf3621b48dae73cedcb1e59cb4cbe72b4), [`32e62ab`](https://github.com/TanStack/ai/commit/32e62ab8b7dc6a8a13ca3851c8925ab806e08f29)]:
  - @tanstack/ai@0.47.0

## 0.2.0

### Minor Changes

- [#896](https://github.com/TanStack/ai/pull/896) [`41a5d18`](https://github.com/TanStack/ai/commit/41a5d189082331e052e1f2f5e987848501ffd08b) - Add a self-describing `billed` field to `TokenUsage` so billed quantities carry the unit they are counted in ([#816](https://github.com/TanStack/ai/issues/816)). `usage.billed` is `{ quantity, unit }` with a `BillingUnit` union (`'seconds'`, `'units'`, `'images'`, `'tokens'`, ... open-ended). The deprecated `unitsBilled` / `durationSeconds` counts are still populated for backward compatibility. The fal adapters report `{ quantity, unit: 'units' }`, Grok video `{ quantity, unit: 'seconds' }`, the OpenAI/Grok/BytePlus duration-billed transcription paths `{ quantity, unit: 'seconds' }`, BytePlus Seedream images `{ quantity, unit: 'images' }`, BytePlus Seedance video `{ quantity, unit: 'tokens' }`, and Cohere/OpenRouter rerank `{ quantity, unit: 'units' }` (search units). Persistence sums `billed` when both reports use the same unit. `otelMiddleware` emits the pair as `tanstack.ai.usage.billed_quantity` / `tanstack.ai.usage.billed_unit` span attributes.

### Patch Changes

- Updated dependencies [[`41a5d18`](https://github.com/TanStack/ai/commit/41a5d189082331e052e1f2f5e987848501ffd08b), [`4599019`](https://github.com/TanStack/ai/commit/4599019eb02f72562ef155b69b8f61f9d25d187a), [`3eda66c`](https://github.com/TanStack/ai/commit/3eda66cb132def6346829ba113f315ffdd4edf6b), [`ecd12a4`](https://github.com/TanStack/ai/commit/ecd12a408987bc75649c21aada6948282a2a66dd)]:
  - @tanstack/ai@0.46.0

## 0.1.5

### Patch Changes

- [#1117](https://github.com/TanStack/ai/pull/1117) [`3e94871`](https://github.com/TanStack/ai/commit/3e94871c5a27113bab59c0f514dfe1010e686b3e) - Ignore empty `TEXT_MESSAGE_START` message IDs so tool-call `parentMessageId` can be used.

- [#1129](https://github.com/TanStack/ai/pull/1129) [`302c9f6`](https://github.com/TanStack/ai/commit/302c9f692041e1b351fe780f85a03d261a0b4c87) - Persist cumulative usage for chat runs that make multiple model calls, interrupt, fail, or abort.

- Updated dependencies [[`d10dfe6`](https://github.com/TanStack/ai/commit/d10dfe6eca788ae52631d45e5599aa0c45e9ba37), [`eda82cc`](https://github.com/TanStack/ai/commit/eda82cc8a86923afd604a663d050c6edfa6b829b), [`c63319e`](https://github.com/TanStack/ai/commit/c63319e34a2ca2f1d56b90addf28784f7c3e13ad), [`b09e010`](https://github.com/TanStack/ai/commit/b09e010b32932c812e65b1e14f6faa2b0e6d5cb8), [`0fb8263`](https://github.com/TanStack/ai/commit/0fb826321c9ba7bd5d8ba0062be2a00b6178726d)]:
  - @tanstack/ai@0.45.0

## 0.1.4

### Patch Changes

- [#1101](https://github.com/TanStack/ai/pull/1101) [`99fb2b7`](https://github.com/TanStack/ai/commit/99fb2b7b113548b20afa894e014bd03773815a41) - Preserve stable IDs and creation timestamps for server-generated assistant messages across persistence and hydration.

- Updated dependencies [[`99fb2b7`](https://github.com/TanStack/ai/commit/99fb2b7b113548b20afa894e014bd03773815a41)]:
  - @tanstack/ai@0.44.1

## 0.1.3

### Patch Changes

- [#1090](https://github.com/TanStack/ai/pull/1090) [`24622c7`](https://github.com/TanStack/ai/commit/24622c7927c734bf493cfc332b6baecc4483f366) - `withPersistence` now maps cancelled client-tool and approval resume entries
  into `cancelledToolCallIds`. A resume batch that is only cancellations still
  produces a `resumeToolState`, so the engine can complete the turn instead of
  emitting another `client_tool_*` interrupt.

## 0.1.2

### Patch Changes

- [#1071](https://github.com/TanStack/ai/pull/1071) [`ea9c077`](https://github.com/TanStack/ai/commit/ea9c07724bd6992480238a699fbb18835eab743e) - fix: publish internal dependency ranges as `^x.y.z` instead of exact pins

  Internal dependencies on other TanStack AI packages used `workspace:*` in
  `dependencies` and `peerDependencies`. pnpm rewrites that to an **exact** version
  at publish time, so a released package asked for e.g. `@tanstack/ai-utils@0.4.0`
  rather than `^0.4.0`.

  Two consequences for consumers:
  - **Duplicate copies.** An exact pin cannot dedupe. Installing a newer
    `@tanstack/ai` alongside a package pinned to the previous patch produced two
    copies in the tree, which breaks `instanceof` checks and module-level state,
    and inflates bundles.
  - **Unsatisfiable peers.** An exactly pinned `peerDependency` conflicts the
    moment the internal package ships its next patch, forcing consumers into
    overrides or `--legacy-peer-deps`.

  These fields now use `workspace:^`, which publishes as `^x.y.z`. Every package
  here is still `0.x`, so `^0.43.1` resolves to `0.43.x` only — patches dedupe
  cleanly and no breaking minor is ever pulled in.

  `devDependencies` deliberately keep `workspace:*`: they are never published, and
  `*` correctly means "always build against the local copy".

- Updated dependencies [[`59aa8b5`](https://github.com/TanStack/ai/commit/59aa8b5049549246227c8f2cf736ce50d05205a5), [`ee07854`](https://github.com/TanStack/ai/commit/ee07854fd3d2d4bb279e6e4748802f7f9a5a7167), [`b785cc4`](https://github.com/TanStack/ai/commit/b785cc4ae382fb0e2a337199d192bd9335ac9249), [`47e2464`](https://github.com/TanStack/ai/commit/47e246480d29e2ab5a83ca684e047670e75ba66c), [`dd7ddf1`](https://github.com/TanStack/ai/commit/dd7ddf19283358adfbf61d057321d7daee3ca50d), [`6903978`](https://github.com/TanStack/ai/commit/690397804254dca638961c79b7941555edc52c02), [`fdb791a`](https://github.com/TanStack/ai/commit/fdb791a1c9c8de906eecf76f59743f697621b027), [`7aa4ae9`](https://github.com/TanStack/ai/commit/7aa4ae9d07d21195dd3d62598ac503f1dfdc79e4), [`ea9c077`](https://github.com/TanStack/ai/commit/ea9c07724bd6992480238a699fbb18835eab743e)]:
  - @tanstack/ai@0.44.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`ed44467`](https://github.com/TanStack/ai/commit/ed44467c5e701f0a4fcc1c9f5639d036de35d26a)]:
  - @tanstack/ai@0.43.1

## 0.1.0

### Minor Changes

- [#1051](https://github.com/TanStack/ai/pull/1051) [`7499171`](https://github.com/TanStack/ai/commit/74991716aea4d90a5d0363676a1e3349689a48e8) - Fix `pipeToRunLog` recording an aborted drive as `'completed'`.

  `pipeToRunLog` checked its `signal` only inside the per-chunk loop, so an abort that arrived _between_ chunks — or a producer that reacted to the signal by simply ending its stream, which is what `chat()` does — let the loop exit normally and fall through to the success path. The run was then recorded `status: 'completed'` with a `finishedAt` it never earned. The signal is now re-checked after the loop: an aborted drive finishes as `'aborted'` whatever the producer did on its way out. A producer that _throws_ on abort still records `'failed'` (the thrown value is what a tailing client must be shown), a genuine completion still records `'completed'`, and `durability.close()` still runs on every exit path.

  The visible symptom was a false transcript on the worst possible run: `reapDetachedRuns` force-expiring a detached run past its TTL, destroying its sandbox, and reporting the run as having completed successfully. Any caller whose producer ends its stream on abort hit the same gap, including a takeover whose claim is lost mid-drive.

  With the status honest, `reapDetachedRuns` no longer reports the TTL-expiry path as the `'budget-exceeded'` anomaly. That outcome is documented as meaning the journal read, translation, or log is misbehaving, and it is now reserved for the finalization path where the probe already said the agent was finished. On the expiry path there is no probe and `runBudgetMs` is the only thing that stops a still-producing agent, so the designed stop reports `'expired'` — with `status: 'aborted'` distinguishing an agent cut off mid-sentence from one that had already finished.

  Add `@tanstack/ai-byteplus`, an adapter package for BytePlus ModelArk: Seed
  chat models, Seedance video generation, Seedream image generation, and Seed
  Speech text-to-speech and transcription.

  Seedance was already reachable through `@tanstack/ai-fal`, which proxies it.
  This package is the direct-to-BytePlus path — BytePlus billing and rate limits,
  the first-class Seedance request fields, and BytePlus's own model ids — so the
  overlap is deliberate. Seed Speech is a separate BytePlus product and needs its
  own API key (`BYTEPLUS_VOICE_API_KEY`), not the Ark key.

  Remove zod from `@tanstack/ai`'s dependency graph entirely.

  `@ag-ui/core` is bumped to `0.1.1-canary.beta.0`, which drops zod from its
  runtime dependencies and declares it as an optional peer instead. Previously
  every `@tanstack/ai` install pulled zod in transitively through it.

  `chatParamsFromRequest` / `chatParamsFromRequestBody` were the only zod
  consumers in this package — they validated request bodies with AG-UI's
  `RunAgentInputSchema`. They now validate the same `RunAgentInput` contract
  structurally, so `@tanstack/ai` ships with no schema-validation runtime at all
  and neither requires nor suggests zod.

  No API change: both helpers keep their signatures, still reject non-conforming
  bodies with a migration-pointing `AGUIError` (`chatParamsFromRequest` still
  throws a 400 `Response`), and still carry TanStack's canonical `parts` field
  through on messages. Validation errors now name the offending field —
  `messages[1].content must be a string` instead of a zod issue dump.

  zod remains fully supported for defining tools; it is simply no longer
  installed on your behalf. If you relied on getting zod transitively without
  declaring it, add it explicitly: `npm install zod`.

  Adopt the AG-UI interrupt lifecycle for tool approvals, generic responses, and
  client-tool execution, with typed bound resolvers, atomic batches, and
  structured errors. Interrupts run ephemerally by resuming from the full client
  message history in a fresh child run — no persistence required.

  This changes native approval and client-tool streams from legacy custom events
  to snapshot-plus-`RUN_FINISHED` interrupt outcomes. Deprecated
  `pendingInterrupts`, `addToolApprovalResponse`, raw `resumeInterrupts`, and
  legacy event readers remain as limited compatibility surfaces for migration;
  `addToolResult` remains supported.

  The artifact options for `withGenerationPersistence` are now named
  `ArtifactPersistenceOptions`.

  They were declared as a second `export interface WithPersistenceOptions`, which
  TypeScript merged with the chat middleware's options of the same name. The merge
  was invisible but not harmless: `withPersistence(chat, …)` silently accepted
  `extractArtifacts` / `storageKey` / `allowInputUrl` / `artifactFetch`, and
  `WithGenerationPersistenceOptions` — which extends it — advertised
  `snapshotStreaming` / `snapshotIntervalMs`. Every one of those is a no-op on the
  other middleware, so autocomplete offered options that did nothing.

  `WithPersistenceOptions` keeps its meaning: the chat middleware's options.
  `WithGenerationPersistenceOptions` is unchanged in shape and is still what you
  pass to `withGenerationPersistence`, so only code that named the artifact
  interface directly needs an edit:

  ```diff
  -import type { WithPersistenceOptions } from '@tanstack/ai-persistence'
  -function artifactOptions(): WithPersistenceOptions {
  +import type { ArtifactPersistenceOptions } from '@tanstack/ai-persistence'
  +function artifactOptions(): ArtifactPersistenceOptions {
     return { storageKey: ({ runId, artifactId }) => `media/${runId}/${artifactId}` }
   }
  ```

  A bootstrap shell that dies mid-setup now fails the run instead of exhausting the host's memory, and teardown's `destroy` is no longer cancelled by the abort that triggered it.

  **`createBootstrapShell`'s sentinel loop had no exit but the sentinel.** `run()` read lines until it saw `<sentinel> <code>`, and the stdout drainer resolved every parked waiter with `''` once the stream ended — indistinguishable from the empty lines `sh` emits constantly. So when the shell exited without printing its sentinel (a missing binary, an OOM kill, the provider reaping the sandbox mid-bootstrap, a transport reset), the loop spun on an infinite supply of `''`, pushing each one into its output buffer until the host process died of memory exhaustion. Two independent terminators now exist:
  - End-of-stream is signalled as `null`, distinct from an empty line, so `run()` rejects the moment the shell is gone — with the drainer's own thrown value attached as `cause` when the stream errored rather than ended.
  - A per-command deadline for a shell that stays alive and simply never answers. `BootstrapShellOptions.commandTimeoutMs` configures it; the default is 30 minutes, deliberately generous because setup steps legitimately run that long (`npm install`, image pulls).

  `drainStdout` also unblocks every parked waiter in a `finally`, so a throw while iterating stdout can no longer leave callers on a promise nobody resolves.

  **`defineSandbox`'s teardown `destroy` no longer forwards `ctx.signal`.** `destroy` runs on every teardown path _including_ the one caused by that signal aborting, so forwarding it handed the provider an already-aborted signal: a provider that honors it did nothing and returned successfully, and the instance-store `delete` that follows then removed the only pointer to a live, billed sandbox. `SandboxInstanceStore` has no `list`, so that sandbox was unreachable from then on. Teardown now uses a fresh controller with its own 60s bound — cleanup outlives whatever cancelled the work, without being able to hang forever. Same reasoning as `close()` never being fenced by the run claim.

  Add browser-refresh durability to the `persistence` option.

  The client `persistence` adapter now stores one combined record per chat id, the message transcript plus a resume snapshot, so a full page reload restores the conversation, rehydrates any pending interrupt, and rejoins a run that was still streaming (via `joinRun`, when the connection is durability-backed). A bare `UIMessage[]` from an older store is still read for backward compatibility.

  **If you hand-rolled a `persistence` adapter, update its write path.** `setItem` now receives the combined `{ messages, resume? }` record where it used to receive a bare `UIMessage[]`, so an adapter that assumed an array will write the new shape and then fail to parse it back — and because adapter reads are best-effort, the failure is silent: the conversation simply does not restore. Read `{ messages, resume? }` in `getItem` (a bare array is still accepted), or switch to the `localStoragePersistence` / `sessionStoragePersistence` / `indexedDBPersistence` adapters below, which handle it for you.

  The `persistence` option also accepts `true` for a server-authoritative chat: the client caches nothing, and on mount it hydrates the thread from the server by its `threadId` (painting the stored transcript and tailing any run still generating). Use it to keep large transcripts off the client while the server stays authoritative for history; it needs a connection with a `hydrate` handler and a server GET endpoint (`reconstructChat`). Passing an adapter is client-authoritative; omitting `persistence` (or `false`) is ephemeral, in-memory only.

  New web storage adapters are exported for this: `localStoragePersistence`, `sessionStoragePersistence`, and `indexedDBPersistence` (plus `StorageUnavailableError` and the `ChatPersistedState` / `ChatStorageAdapter` / `ChatPersistenceOption` types). Because durability rides the existing `persistence` option, every framework integration (`react`, `solid`, `vue`, `svelte`, `angular`, `preact`) gets it with no framework-specific code.

  A restored generation whose result can't be rebuilt now reports an error instead
  of repainting as a blank success.

  Every `reconstructResult` mapper in `generation-reconstruct.ts` (and the video
  client's built-in `reconstructVideoResult`) returns `null` when the persisted
  record lacks what it needs — most commonly an output artifact stored without a
  serve `url`, which is possible because `artifactUrl` is optional server-side.
  `repaintFromSnapshot` silently skipped `setResult` in that case, leaving
  `status: 'success'` with `result: null`: a state no consumer can render, and one
  that hides the real cause.

  When a mapper declines a snapshot whose status is `complete`, the restore now
  settles on `status: 'error'` with an explanatory message and fires `onError`. A
  decline on any other status is still silent — a `running` snapshot has no result
  yet by definition, and the rejoin delivers it. A client with no
  `reconstructResult` mapper at all is unaffected.

  Server-driven generation hydration no longer swallows every failure.

  `GenerationClient` / `VideoGenerationClient` mount hydration
  (`persistence: true`) wrapped the whole `hydrateGeneration` call in a bare
  `try { … } catch { return }`, collapsing a transport error, a `403` from the
  `reconstructGeneration` authorize gate, an unparseable body, and "no record for
  this thread" into one indistinguishable silent no-op — so an app could not tell a
  broken server from a fresh thread, and had no signal to retry.
  - A genuine **miss** (the server reports no record) stays silent, as before.
  - A genuine **failure** now surfaces on `status` / `error` and fires `onError`,
    with a message naming the cause. A record the client's own validator rejects
    (unknown schema version, missing/invalid `status` or `resumeState`) counts as a
    failure, not a miss.
  - The failure is skipped when a `generate()` took ownership of the client while
    the hydrate request was in flight — the live run still wins.

  Relatedly, `fetchServerSentEvents` / `fetchHttpStream` `hydrateGeneration` now
  only treats a `200` carrying `null` as a miss. Any other non-object body (a
  string, an array) rejects instead of being reported as an empty thread, so a
  misconfigured route no longer masquerades as a fresh one.

  A generation stream that ends without a terminal chunk now settles to `error`
  instead of wedging the client on `generating` forever.

  `GenerationClient.processStream` / `VideoGenerationClient.processStream` only
  settled the status on `RUN_FINISHED` or `RUN_ERROR`. A `for await` loop over a
  stream that simply _ends_ — a proxy/load-balancer idle timeout, a server restart
  mid-run, or a durable log whose terminal append never landed — returns normally,
  so no catch fired and the client came to rest on
  `status: 'generating'`, `isLoading: false`, `result: null`, with `onError` never
  called. Worse, the resume snapshot stayed `running`, so every subsequent mount
  rejoined the same dead run and repeated the same outcome.

  Both clients now throw when the stream ends with no terminal chunk seen (and the
  read wasn't aborted by `stop()` / `dispose()`), which routes the failure through
  the existing error path: `status: 'error'`, `error` set, `onError` fired, and the
  resume snapshot rewritten to a terminal `error` with a null `resumeState` so
  nothing chases it again. This applies to both the initial `generate()` path and
  the mount-time `rejoinInFlight` path. A rejoin failure now also fires `onError`,
  matching `generate()`.

  This is the sibling of the earlier "rejoin settles to error" fix, which covered a
  missing and a throwing `joinRun` but not a join that returns cleanly with no
  terminal chunk.

  `localStoragePersistence` / `sessionStoragePersistence` / `indexedDBPersistence`
  are no longer generic. Each returns a `ChatStorageAdapter<ChatPersistedState>`,
  and `WebStoragePersistenceOptions` types its `serialize` / `deserialize` codec
  over `ChatPersistedState`.

  The type parameter existed so one adapter could back both the chat and the
  generation `persistence` option. Generation `persistence` is now `boolean`
  (server-driven only), so chat is the sole option that takes a storage adapter and
  the parameter had no second value to hold.

  A bare `localStoragePersistence()` is unchanged. A call that passed an explicit
  type argument for a standalone store, `localStoragePersistence<MyValue>()`, no
  longer compiles: build that store with your own object literal, since these
  factories are for chat state.

  Extend the shared conformance testkit to the generation stores.

  **Migration — every existing adapter must update its conformance call.** The suite now fails loudly on a store that is absent without being declared, so a chat-only adapter that used to pass unchanged will start failing on `generationRuns` / `artifacts` / `blobs`. Declare them absent:

  ```diff
  - runPersistenceConformance('my-adapter', () => makePersistence())
  + runPersistenceConformance('my-adapter', () => makePersistence(), {
  +   skip: ['generationRuns', 'artifacts', 'blobs'],
  + })
  ```

  Drop an entry from `skip` as you implement that store — the suite then holds it to the contract below. Declaring absence is deliberate: a silently skipped store is how an adapter ships a `generationRuns` implementation that was never exercised.

  `runPersistenceConformance` now exercises `generationRuns`, `artifacts`, and `blobs` alongside the four chat state stores, so a hand-rolled generation backend is held to the same gate as a chat one: `createOrResume` idempotency and `findLatestForThread` (latest by `startedAt`, thread-scoped, terminal runs included) on the run store; upsert `save`, `list(runId)` ordering, and `delete` / `deleteForRun` scoping on the artifact store; and byte/metadata round-trips, overwrite, silent absent-key `delete`, and `list` prefix + cursor paging on the blob store. Two invariants that were easy to get wrong and are now checked: `list`'s `prefix` matches **literally and case-sensitively** (a SQL backend using `LIKE` fails on both counts, since SQLite's `LIKE` is case-insensitive for ASCII and treats `%` / `_` as wildcards), and cursor paging visits every key exactly once.

  `examples/ts-react-chat`'s self-contained `node:sqlite` adapter implements all seven stores and runs the full suite; its server-side generation route is backed by that adapter, so generated images survive a dev-server restart.

  Fix `@tanstack/ai` breaking non-React TanStack Start builds.

  A JSDoc example on `replayRunStream` inlined a server-function builder chain. Comments survive into `dist`, and Start's server-fn Vite plugin decides whether a module needs compiling by regex-matching the source — so it treated this package as a server-fn module and tried to resolve the framework's `@tanstack/*-start` package, failing the build of any Solid/Vue/Svelte Start app (`could not resolve "@tanstack/solid-start"`). The example now declares the generator separately and no longer trips the match.

  `GenerationMiddlewareContext.resultTransforms` is now required.

  Middleware registers a result transform by pushing onto the array, so an optional one let a host that builds its own context omit it and silently no-op every registration — generation persistence would then mark a run completed with neither its result nor its artifacts written, with nothing to observe but the missing data. Every context the library builds already comes from `createGenerationContext`, which always sets `[]`, so this only affects code that constructs a `GenerationMiddlewareContext` by hand: set `resultTransforms: []`.

  `summarize()` accepts generation middleware, so summaries can be persisted.

  `useSummarize({ persistence: true, threadId })` type-checked exactly like the six media hooks, but `summarize()` took no `middleware`, so no library path could ever write its run record and a reload restored nothing. It now takes `middleware` like the `generate*` activities: one `onStart`, the result transforms applied to the `SummarizationResult`, then `onFinish` / `onError`, in both streaming and non-streaming mode (a consumer that disconnects mid-summary fires `onAbort`). In streaming mode the transformed result is what is yielded, so the client and the persisted record hold the same object.

  `GenerationActivity` gained `'summarize'`, and `otelMiddleware` maps it to the `summarize` operation name. Summaries are text, so there are no artifacts: a persistence middleware stores the run record and its result and nothing else.

  Fix non-streaming `generateVideo()` losing the generation when persistence is on.

  A non-streaming `generateVideo()` call only SUBMITS a job — the video does not exist until a later poll — but it fired `onFinish` as soon as the job was queued and never applied the result transforms, and it never put the caller's `threadId` on the middleware context. With `withGenerationPersistence` that meant `generateVideo({ threadId, middleware })` threw for want of a scope, and (once given one) would have stamped the run `completed` with no result, no url, and no stored bytes, while the eventual result had nowhere to land.

  Submitting a job now OPENS the run and `getVideoJobStatus()` closes it, with the two calls correlated by the provider's **`jobId`** — the one id a poller structurally cannot be missing, since it cannot poll without it. Nothing else has to be threaded through:
  - `generateVideo()` (non-streaming) passes `threadId` and the prompt inputs to middleware, files the run under an id derived from the provider + `jobId`, applies the result transforms to the submission (so the run record captures the `jobId` and stays resumable from a later request or process), and fires **no terminal hook**.
  - `getVideoJobStatus()` accepts `threadId` and `middleware`, and recomputes the same run id from `adapter` + `jobId`. On the poll that first observes a terminal job state it resumes that run, applies the result transforms — which is where persistence copies the video into the blob store and rewrites `url` to a durable one, so the returned result and the stored record carry the same urls — and fires `onFinish`, or `onError` when the job (or the url fetch) failed. Intermediate polls invoke nothing. Its result gained `jobId`, `expiresAt`, and `artifacts`; `VideoJobResult` gained `artifacts` (refs for persisted prompt INPUTS, e.g. a start frame).
  - `runId` on a non-streaming `generateVideo()` call is **ignored** (it remains the wire run id in stream mode). The run id has to be recomputable by the poll from the `jobId` alone; honoring a custom one would reintroduce the failure this avoids — a caller who set it on the submit and forgot it on the poll would silently open a second record while the first sat unfinished forever.

  Two consequences worth knowing. Because the job id only exists once the provider accepts the job, `onStart` now fires AFTER the submit request, so an `otelMiddleware()` span covers the run from acceptance onward rather than the submit round-trip, and a submission that FAILS (no job to key on) opens and immediately fails a run under the call's `requestId` — terminal and unresumable, but filed under the thread so a hydrating client sees the failure. And `threadId` must reach the poll: omitting it makes generation persistence throw loudly rather than file the finished video where nothing can hydrate it.

  Add `defineLock` to `@tanstack/ai/locks`: an identity typer for a `LockStore`
  implementation, matching the `define*Store` helpers in `@tanstack/ai-persistence`.
  Pass a `withLock` object and get autocomplete and contract checking inline, with
  no `: LockStore` annotation, then hand it to `withLocks`.

  ```ts
  import { defineLock, withLocks } from '@tanstack/ai/locks'

  const locks = defineLock({
    async withLock(key, fn) {
      const { release, signal } = await acquire(key)
      try {
        return await fn(signal)
      } finally {
        release()
      }
    },
  })

  const middleware = [withLocks(locks)]
  ```

  Add per-store typer helpers: `defineMessageStore`, `defineRunStore`,
  `defineInterruptStore`, `defineMetadataStore`.

  Each takes a store implementation and returns it typed against the contract, so
  you get autocomplete and checking on the object literal inline — no separate
  `: MessageStore` return annotation. They compose into `defineAIPersistence`,
  which already infers **exact presence**: a store you define is a defined,
  non-optional, autocompleted key on `persistence.stores`, and accessing a store
  you did not define is a compile error.

  ```ts
  import {
    defineAIPersistence,
    defineMessageStore,
    defineRunStore,
  } from '@tanstack/ai-persistence'

  const persistence = defineAIPersistence({
    stores: {
      messages: defineMessageStore({ loadThread, saveThread }),
      runs: defineRunStore({ createOrResume, update, get, findActiveRun }),
    },
  })

  persistence.stores.runs // RunStore (defined)
  persistence.stores.interrupts // compile error — not provided
  ```

  Deprecate generation `id` in favor of `threadId` as the single identity.

  `threadId` is the scope for the wire, devtools, and persistence. When it is
  supplied, `id` is typed `never` so you cannot pass both. Legacy `id` remains
  only for ephemeral runs that have no `threadId` (wire/devtools fallback) and is
  marked `@deprecated`.

  Fixed: a detached run's delivery log stays open, so a takeover can actually continue it.

  The durable delivery sink behind `toServerSentEventsResponse` / `toHttpResponse` appended a synthetic terminal `RUN_ERROR` ("Request aborted") and called `durability.close()` on **every** abort. On a plain disconnect of a detachable run — the whole point of durable runs — that defeated the feature twice over:
  - the log was terminalized, so a later attach's replay ended at the stored `RUN_ERROR` instead of continuing, and
  - that `RUN_ERROR` is a chunk the takeover's journal replay cannot reproduce, so `alignToStoredLog` threw `JournalReplayDivergedError`, `pipeToRunLog` recorded the perfectly healthy detached run as `'failed'`, and appended a _second_ terminal error.

  The sink now consults the run's own abort verdict. `withSandbox`'s `onAbort` publishes the new `RunDetachedCapability` on its detach branch — it is the only actor that has resolved both out-of-band cancel bands (`AbortInfo.cancelRequested` and `wasCancelRequested` on the record) plus `detachOnDisconnect` — and core carries the fact to the transport on the stream object itself, so there is nothing for an application to wire.

  Only a plain, intentless disconnect of a detachable run is spared. An explicit cancel in either band, a disconnect on a non-detachable run, `detachOnDisconnect: false`, a genuine provider failure, and a normal finish all terminalize and close exactly as before — a run is never left with an open log and no successor. Core additionally refuses to treat an abort carrying `RUN_CANCEL_REASON` as a detach whatever a middleware claims, so a user pressing Stop always gets a closed, terminal log.

  **Surface server-side memory state in the TanStack AI DevTools.**

  The DevTools panel now has a **Memory** tab for any chat wired with
  `memoryMiddleware`. It shows, per scope (session), an operations timeline (each
  turn's recall — query, fragment count, injected system-prompt size, whether
  memory tools were exposed, duration) and the current stored records/facts when
  the adapter implements the optional `inspect`/`listFacts` methods.

  Because memory runs on the server (whose event bus never reaches the browser),
  the middleware transports its state to the panel over the chat stream as a
  `memory:state` `CUSTOM` event, which `@tanstack/ai-client`'s devtools bridge
  re-emits as browser `memory:*` events — the same pattern generation results use.
  The snapshot reflects memory as of the start of each turn; opening the panel
  mid-conversation replays the latest state so the tab isn't empty.
  - `@tanstack/ai-memory` — `memoryMiddleware` injects a `memory:state` `CUSTOM`
    chunk carrying recall metrics + an `inspect`/`listFacts` snapshot; exports
    `MEMORY_STATE_EVENT` and `MemoryStateEventValue`.
  - `@tanstack/ai-event-client` — adds the `memory:snapshot` devtools event.
  - `@tanstack/ai-client` — the chat devtools bridge re-emits `memory:*` from the
    transported chunk and replays the last snapshot on `devtools:request-state`.
  - `@tanstack/ai-devtools-core` — new Memory tab + per-scope memory store slice.

  A sandboxed agent's run now survives a disconnect and can be picked back up by a later request instead of being torn down with the connection that started it. Wire `runs` + `durability` into `withSandbox` (the same `RunStore` chat persistence uses) and a disconnect on a durable run leaves the agent running, records `detachedSince`, and a later attach for the same `runId` replays the stored log, aligns against it, and keeps streaming from where the previous host left off.
  - **Single-writer enforcement.** A durable run is driven under a lease (`locks.withLock`) plus an `epoch` fence (`RunRecord.driverEpoch`, re-checked every 32 appends) plus a quiescence gate over `snapshot()` before a successor starts appending. A superseded driver's append is refused (`RunClaimLostError`) and, separately, its refusal can no longer terminalize the run record it lost the claim to — only the current claim holder may write a terminal status.
  - **`sandboxRunDriver`** (`@tanstack/ai-sandbox`) wires the claim and the run log together so an app supplies `request`/`runs`/`locks`/`durability`/`drive` rather than hand-rolling the claim/fence sequencing itself.
  - **Out-of-band cancel.** `requestRunCancel(runs, runId)` (durable — reaches a run being driven by a different host) and the `RUN_CANCEL_REASON` abort sentinel (in-process — fast path when the cancel reaches the driving host) are the only two channels that carry cancel intent; a plain disconnect and an explicit Stop produce the identical TCP close and are no longer conflated. `wasCancelRequested` reads the durable flag back; a store failure degrades to a detach rather than throwing, since a scheduled TTL reaper (see the `reapDetachedRuns` changeset) can still reclaim a stuck detach — provided the application actually schedules it; nothing sweeps `detachedSince` on its own.
  - **`@tanstack/ai-persistence`'s `onAbort` now distinguishes the two.** An explicit cancel (either channel) or a non-detachable run writes terminal `'aborted'`. A plain disconnect on a detachable run writes nothing — the record stays `'running'` for a later attach to resume, rather than the previous behavior of marking every disconnect `'interrupted'` with a terminal `finishedAt`.
  - **`ai-codex`, `ai-claude-code`, `ai-grok-build`** thread the durable `runId` through their journal and attach paths: `resolveDurableRunId` enforces a caller-supplied id whenever sandbox durability is wired (throwing `DurableRunIdRequiredError` otherwise, since a random fallback id is not derivable by a successor), `journalOptionsFor` builds the journal option only when durability is active, and `alignedIfAttaching` wraps the merged output stream so an attach replays and aligns against the stored log instead of restarting the agent. **`ai-opencode` and `ai-acp` do not journal**; both route through `resolveDurableRunId` with enforcement off (`durable: false`) and keep their generated-id fallback, purely so that whenever either gains journaling it inherits the caller-supplied-`runId` requirement instead of re-deriving it.
  - **`makeFakeShellSpawn`** ships from `@tanstack/ai-sandbox/testkit` for exercising the journal/claim/driver seam against a fake shell without a real sandbox provider.
  - **`RunError` in `@tanstack/ai-persistence`'s conformance suite now pins the `undefined`-vs-`false` distinction** on `cancelRequested`, `detachedSince`, `sandboxKey`, and `driverEpoch`: a fresh run must read all four back as `undefined` (not a coerced falsy default), and an explicitly-written `cancelRequested: false` must round-trip as `false`, distinct from the unset case.

  ### Breaking: `@tanstack/ai-sandbox`'s `RunDeps.durability` is now a per-run factory

  ```diff
   export interface RunDeps {
     runs: RunStore
  -  durability: StreamDurability
  +  durability: (runId: string) => StreamDurability
   }
  ```

  A single `StreamDurability` instance is bound to one run (a backend adapter's offsets embed a cursor into one log), so holding one instance let a caller silently mis-bind a run at concurrency 1 (`start({ runId })` accepted an arbitrary id while the instance stayed bound to whatever run it was constructed for, writing the lifecycle record under one id and the events under another with no error) and let concurrent runs cross-talk (parallel runs interleaved into the same log, and whichever finished first `close()`d every other run's stream too). `pipeToRunLog` and `RunController` now resolve the log FROM the `runId` being driven, once per run, which makes both failures unrepresentable. `RunController.attach` and the rest of its per-run surface now take `runId` explicitly instead of assuming a single bound log.

  **Not released — this stays a minor, not a major.** The durability surface introduced in earlier phases of this branch has not shipped in a published version, so this break reaches no released consumer. Migration for anyone building against the unreleased surface: change `durability` from an instance to `(runId) => StreamDurability`, and pass `runId` to `RunController.attach`.

  ### Breaking: `@tanstack/ai-persistence`'s `onAbort` no longer marks every disconnect `'interrupted'`

  `onAbort` used to write `status: 'interrupted'` with a terminal `finishedAt` on every abort, including a plain disconnect. `'interrupted'` is not supposed to be terminal-shaped (`isTerminalRunStatus('interrupted')` is `false`), so stamping a terminal timestamp on it told every reader the run was over while it might only be paused or still streaming elsewhere. `onAbort` now branches: an explicit cancel or a non-detachable run calls the new `abortRun` helper (`status: 'aborted'`, terminal); a plain disconnect on a detachable run writes nothing at all, leaving the record `'running'` for a later attach.

  **Migration:** a reader that treated every post-abort record as `'interrupted'` with a `finishedAt` must instead handle a `'running'` record with no `finishedAt` as "detached, possibly resumable" rather than "over." `withGenerationPersistence`'s `onAbort` is unaffected — a generation job has no journal or agent loop to reattach to, so it still unconditionally finalizes as `'aborted'`.

  ### Not breaking, called out for completeness: `AbortInfo.cancelRequested` now populates

  Declared as a placeholder in an earlier phase and unpopulated; core now sets it from the abort reason (`true` when the abort reason is the `RUN_CANCEL_REASON` sentinel, `false` otherwise). Purely additive in the type sense — this widens what was already `boolean | undefined` toward a real value — but is a **behavior** change worth flagging: middleware reading this field to distinguish an explicit cancel from any other abort now gets a real answer instead of always `undefined`.

  fix(persistence): stop charging every adapter for sandbox-only run fields

  `runPersistenceConformance` required every backend to round-trip four fields that
  only durable sandboxed runs use: `sandboxKey`, `detachedSince`, `cancelRequested`
  and `driverEpoch`, including the rule that an omitted patch key means "leave the
  column" while an explicit `undefined` means "clear it". The case was deliberately
  non-skippable, so a Postgres adapter for a plain chat app failed conformance until it
  implemented four columns nothing in its stack would ever write.

  The assertions moved rather than disappeared. `runDurableRunFieldsConformance` now
  ships from `@tanstack/ai-sandbox/testkit`, beside the takeover and reaper suites that
  consume those fields, and takes the same `runs` store:

  ```ts
  import { runDurableRunFieldsConformance } from '@tanstack/ai-sandbox/testkit'
  import { persistence } from './persistence'

  runDurableRunFieldsConformance(
    'my postgres runs',
    () => persistence.stores.runs,
  )
  ```

  So a chat-only backend leaves those columns out of its schema and passes, and an app
  that wires `withSandbox(sandbox, { runs, durability })` proves them with one extra
  line. The fields were already optional on `RunRecord` and `listReclaimable` was
  already optional and feature-detected; the conformance suite was the only thing making
  them mandatory in practice.

  Docs follow the same split. The fields are explained where they are used, on
  `persistence/build-a-sandbox-adapter` ("The four run fields", with the failure each
  omission causes), and `persistence/store-reference` marks them sandbox-only and points
  there instead of teaching them inline. The chat walkthrough's `runs` example labels
  them SANDBOX ONLY, since a reader following it for a chat app should skip them.

  A sandboxed agent's output now survives the host that started it. The agent writes newline-delimited JSON to a **journal** file inside the sandbox instead of into a pipe the host holds, so the host can return, die, or be replaced without taking the agent down with it, and a bounded read of the already-stored event log lets a successor line its own output up against the prefix a previous host delivered.

  This entry covers the journal, the journal reader, and the alignment primitive — the substrate the rest of the durable-run surface is built on. Detach, takeover, out-of-band cancel, and the reaping sweep ship in the same release and are described in their own entries: `RunRecord.cancelRequested` is written by `requestRunCancel` (`@tanstack/ai`), `detachedSince` and `sandboxKey` are written by `withSandbox`'s detach branch (`@tanstack/ai-sandbox`), and `sandboxRunDriver`, `reapDetachedRuns`, and `pruneJournals` all ship from `@tanstack/ai-sandbox`'s root. What the pieces below give you on their own is: run an agent through a journal, read that journal back from byte 0, and replay a journal against a stored log without duplicating what is already there.

  ### `@tanstack/ai`: `StreamDurability.snapshot`

  `StreamDurability` gains a required `snapshot`:

  ```ts
  snapshot: () => Promise<Array<{ offset: TOffset; chunk: StreamChunk }>>
  ```

  Everything stored for the run at the moment of the call, in append order, then resolve. It never tails and never waits for more entries, it resolves to `[]` for a run with nothing stored rather than throwing, and it returns a fresh array whose pair objects do not reach the stored log. The result carries no lock, so the last returned offset is not a permanent tail.

  It exists because `read` is the only read the interface had, and `read` tails: it parks until the log is terminalized with `close()` or the caller aborts. A crashed producer never calls `close()`, so its log stays open forever and `for await (const entry of read('-1'))` over it never finishes. A producer resuming that run could not inspect the log at all. `snapshot` is the read that returns.

  **Breaking for a custom `StreamDurability`.** The interface is public and shipped in `0.42.0`, so an existing implementation stops compiling until it adds the method. The migration is one method: return your stored entries as `{ offset, chunk }` pairs in append order without waiting, and return `[]` for an unknown run.

  `memoryStream` implements it by peeking at its log map rather than creating one, so an unknown run resolves to `[]` and no empty never-completed log is left behind for the sweep to miss.

  ### `@tanstack/ai-durable-stream`: bounded snapshot over the existing protocol

  `durableStream` implements `snapshot` with no protocol change. The control frame already carried an `upToDate` field that the parser validated and `read` then ignored; `read` and `snapshot` now share one window-pulling loop whose only difference is whether `upToDate: true` ends it. A live `read` keeps long-polling past it, a `snapshot` returns there, which is what makes a snapshot bounded on a stream nobody ever closed.

  Two honest limits:
  - It is bounded by an internal ceiling of 1000 windows. A conforming backend reports `upToDate` within one or two windows; a backend that keeps handing out advancing windows without ever reporting it gets a `DurableStreamError` rather than a read that never returns.
  - It cannot return `[]` for a stream the backend never created. A snapshot must not create a stream as a side effect of reading, so an unknown stream surfaces whatever status the backend returns for it instead of an empty result. `memoryStream` is the implementation that satisfies the empty-run clause exactly.

  ### `@tanstack/ai-sandbox`: the journal

  The substance of the phase.

  **The journal.** An agent's NDJSON stdout is redirected to `/tmp/tanstack-runs/<runId>.ndjson` with its stderr in a `<runId>.err` sidecar and an `{"__exit":N}` sentinel appended when it exits. Because the host holds no handle on the agent's output, there is no pipe to `SIGPIPE`: a trigger can start the agent and return while the agent keeps writing.
  - `spawnNdjson` takes a new `journal?: { runId; dir?; attach?; pollIntervalMs? }`.
  - `startJournaledAgent(handle, command, options)` starts the agent and returns without waiting for it or reading its stdout. Stdin is still written directly to the process.
  - `readJournalNdjson(handle, options)` reads a journal from byte 0 as parsed NDJSON, stops at the sentinel, and throws for a non-zero exit code so a calling adapter's existing `catch` turns it into a `RUN_ERROR`, the same observable outcome the unjournaled path produces from a non-zero `wait()`. The sentinel is the exit code here; there is no process to `wait()` on.
  - `DEFAULT_JOURNAL_DIR`, `EXIT_SENTINEL_KEY`, `journalPaths`, `journaledCommand`, `journalFollowCommand`, `journalReadCommand`, `journalExistsCommand`, plus `decodeBase64Stream` and `toJournalLines` for byte-exact decoding and line splitting.

  **A `runId` must be unique per run.** The journal is append-only on purpose, because a takeover depends on the prefix a previous host delivered still being there, and `DEFAULT_JOURNAL_DIR` is a fixed absolute path that outlives any single sandbox, test, or process. A reused `runId` therefore does not start a fresh journal, it appends behind the previous run's sentinel, and a reader stops at the FIRST sentinel it sees: the new run appears to emit nothing, or to fail with the old run's exit code. This is deliberately not enforced, since refusing to append would break the append-only property the takeover relies on. **Durability therefore requires a caller-supplied `runId`**, and the harness adapters no longer paper over its absence: `resolveDurableRunId` throws `DurableRunIdRequiredError` when sandbox durability is wired and no `runId` was passed, and only falls back to a generated id on a non-durable run. A random fallback is not recomputable by any successor, so no successor could derive the journal path.

  **The reader.** `readJournal` and `journalReadStrategy(handle)` pick between two strategies. `follow` uses `tail -f` and requires both `backgroundProcesses` and `killableProcesses`; everything else falls back to a bounded poll, because a follower that cannot be stopped would leak an unstoppable process inside the sandbox. The follow path is streamed rather than buffered, and honors an `AbortSignal` itself instead of blocking on `stdout` until a best-effort kill closes the pipe.

  **Alignment.** `alignToStoredLog` replays a journal from byte 0, reads the stored prefix once and eagerly through `snapshot()`, suppresses the chunks the log already holds, and forwards the remainder with plain `append`. On a mismatch it throws `JournalReplayDivergedError(index, stored, replayed)` rather than forwarding chunks whose prefix and suffix disagree about message identity. It appends and never upserts by design: `memoryStream.upsert` rejects an offset it did not mint, and `durableStream` has no `upsert` at all because its offsets embed a backend-assigned cursor. Deriving the dedupe boundary from the log means there is no window in which a checkpoint and the log can disagree. Supporting pieces: `createRunScopedIdGen(runId)` (a counter with no clock and no randomness) and `chunkFingerprint` (every field except the wall-clock `timestamp`).

  **Journal lifetime.** Reaching the sentinel means the run is terminal and the event log is now the run's record, so both journal files are deleted before `readJournalNdjson` finishes. The ordering is load-bearing and asserted: the follower is stopped before its input is removed, and the stderr sidecar is read for the error message before the deletion that destroys it. A stream that ends without a sentinel deletes nothing, since the run may be mid-flight and a successor may still need every byte. This per-run cleanup covers only the runs a host watched to completion: a run that reaches its sentinel while detached has no reader, so nothing observes the sentinel. `pruneJournals` (see the `reapDetachedRuns` entry) is the sweep that bounds those, deleting a journal only once its run is provably terminal and keeping everything it cannot prove dead.

  **Conformance.** `runJournalConformance` and `JournalConformanceConfig`, reachable from `@tanstack/ai-sandbox/testkit`, so a provider can prove its journal behavior against the same suite the bundled providers run.

  #### Breaking: `SandboxCapabilities.killableProcesses`

  ```ts
  killableProcesses: boolean
  ```

  New and required. `true` when a spawned process can be terminated through `SpawnHandle.kill` and aborted mid-flight through the `signal` passed to `SandboxProcess.spawn`. A bring-your-own provider stops compiling until it declares one, which is the point: an omitted field would default to killable and leak an unstoppable follower into the sandbox. Migration is one line. Callers must branch on it before relying on `kill` or abort to reclaim a background process.

  Every bundled provider declares it. Cloudflare declares `false`, because its `kill()` is a no-op and Workers RPC cannot serialize an `AbortSignal`, so a `tail -f` started there can only be polled and abandoned.

  ### `@tanstack/ai-sandbox-local-process` and `@tanstack/ai-sandbox-docker`: UTF-8 decoding fix

  Separate from the journal work and older than it. Both decoded spawn stdout and stderr with a per-chunk `Buffer.toString('utf8')`, which corrupts any multi-byte UTF-8 character a Node stream happens to split across two `data` events: each half decodes independently into a replacement character. Both now use a streaming `TextDecoder` that retains a partial trailing sequence across calls and flushes once at end of stream, so a genuinely truncated sequence still surfaces as `U+FFFD` instead of being dropped. This is a correctness fix in its own right and applies to every consumer of these providers, journaled or not.

  ### `@tanstack/ai-claude-code`, `@tanstack/ai-codex`, `@tanstack/ai-grok-build`: deterministic ids on the journaled path

  All three now route agent stdout through the journal and mint message ids with `createRunScopedIdGen(runId)` instead of `generateId()`, so re-translating the same journal bytes produces the same chunk sequence. `generateId()` mixes in `Date.now()` and `Math.random()`, which makes "same bytes produce same chunks" false.

  **Visible behavior change: message id format.** Ids on the journaled path go from a provider-prefixed random id such as `grok-build-1785...-x7f2q` to `<runId>-0`, `<runId>-1`, and so on. Anything that parses a provider prefix out of a message id, or assumes ids are globally unique across runs rather than unique within one, is affected.

  The determinism guarantee is **translator-level**, not stream-level. On codex and claude-code the adapter wraps the translator in `mergeChunkStreams(translated, channel.stream)`, splicing host-tool-bridge custom events from live tool execution into the middle of the stream. Those events do not occur on a replay at all, and even on the original run their interleaving position is timing-dependent rather than derivable from the journal. A run that used bridged tools can therefore still diverge post-merge. Nothing in this phase closes that.

  One run is now described by one record. Chat persistence and the sandbox run driver both read and write the same `RunRecord`, so they can no longer disagree about the status of a given `runId`.
  - **`RunStatus`** (`'running' | 'interrupted' | 'completed' | 'failed' | 'aborted'`), **`TerminalRunStatus`** (`'completed' | 'failed' | 'aborted'`), **`RunRecord`**, **`RunError`**, **`RunStore`**, **`isTerminalRunStatus`**, **`defineRunStore`**, and **`InMemoryRunStore`** now live in `@tanstack/ai` (`packages/ai/src/activities/chat/middleware/run-store.ts`). A `RunStore` needs `createOrResume` / `update` / `get` / `findActiveRun`; `listByThread` and `listReclaimable` are optional.
  - `RunRecord.error` is a structured **`RunError`** (`{ message: string; code?: string }`) instead of a bare `string`. `RUN_ERROR` chunks carry a provider `code`, and the Cloudflare event log already populated one, so a bare message forced consumers to string-match provider prose to decide whether to retry or escalate.
  - `isTerminalRunStatus` is now a type predicate (`status is TerminalRunStatus`) over an exhaustiveness-checked map, so a caller inside the guard can pass the status where a `TerminalRunStatus` is required without a cast. Purely additive.
  - `defineRunStore` is now generic (`<const T extends RunStore>(store: T): T`), so an optional method the implementation actually provides stays known-present on the result instead of collapsing back to `| undefined` on the interface. Purely additive.
  - `AbortInfo` gains an optional `cancelRequested` field, and core populates it: `packages/ai/src/activities/chat/index.ts` sets it from the abort reason via `isCancelRequestedReason(reason)` — `true` for the `RUN_CANCEL_REASON` sentinel, `false` for any other abort. `stream-to-response.ts` relies on it to refuse treating an explicit cancel as a detach, so a user pressing Stop always gets a closed, terminal log. Middleware reading it to tell an explicit cancel from a plain disconnect gets a real answer.

  ### `StreamDurability`: single-argument `append`, upsert as a separate capability

  `StreamDurability.append` takes exactly one argument:

  ```ts
  append: (chunks: Array<StreamChunk>) => Promise<Array<TOffset>>
  ```

  Idempotent re-persistence of an already-stored range is a separate, optional method on a separate interface:

  ```ts
  export interface UpsertableStreamDurability<
    TOffset extends string = string,
  > extends StreamDurability<TOffset> {
    upsert: (
      entries: Array<{ chunk: StreamChunk; offset: TOffset }>,
    ) => Promise<Array<TOffset>>
  }
  ```

  Pairing every chunk with its offset structurally makes a length mismatch, a sparse hole, and an unpaired chunk unrepresentable. `memoryStream` returns `UpsertableStreamDurability` and validates the whole batch before mutating any stored state, rejecting a foreign-format offset, an offset minted for a different run, a duplicate within one batch, and a new offset claiming a position at or before the current tail. `durableStream` in `@tanstack/ai-durable-stream` returns a plain `StreamDurability` and deliberately does **not** implement `upsert`, because its offsets embed a backend-assigned cursor a caller cannot choose: a consumer that requires upsert now gets a compile error at the wiring site instead of a runtime throw, and the guard that used to raise `DurableStreamError` for caller-supplied offsets is gone.

  ### Breaking: `@tanstack/ai-persistence`
  - `RunStatus` widened to include `'aborted'` (previously `'running' | 'completed' | 'failed' | 'interrupted'`). The union appears in a read position (`get(): Promise<RunRecord | null>`), so an exhaustive `switch` over `record.status` with a `never` default in your code stops compiling until it handles `'aborted'`.
  - Run types are re-exported from `@tanstack/ai` rather than declared here, so the `runs` store is typed against core's `RunStore` directly. `MemoryRunStore` implements both optional list methods, and the shared conformance testkit covers them.
  - `runPersistenceConformance` accepts `skipMethods`. An optional method that is missing **and** not declared in `skipMethods` now throws instead of silently passing, so an existing backend running the suite may see a new failure telling it to implement the method or declare the omission.
  - `RunRecord.error` changing from `string` to `RunError` costs no migration today: this package is still unreleased at `0.0.0`.

  ### Breaking: `@tanstack/ai-sandbox`

  The package's own run-tracking types are gone in favor of the core ones:
  - `RunEventLog`, `InMemoryRunEventLog`, `RunEvent`, and `RunEventLogReadOptions` are removed. If you were reading sandbox run events for Cloudflare, the same event-log implementation now lives in `@tanstack/ai-sandbox-cloudflare/agent`.
  - `RunError` is removed along with the package's local `RunRecord`, `RunStatus`, `TerminalRunStatus`, and `isTerminalRunStatus`. Import these from `@tanstack/ai` instead.
  - `pipeToRunLog` and `RunController` no longer take an event log. They take `RunDeps: { runs: RunStore; durability: (runId: string) => StreamDurability<TOffset>; logger?: InternalLogger }` — `durability` is a **per-run factory**, not a single instance (see the durable-agent-runs-takeover entry for why a single instance was unsafe).
  - `RunController.attach` takes `(runId, fromOffset, signal?)`: the run being attached, an opaque `fromOffset: TOffset` (`string` by default) minted by `StreamDurability` instead of a numeric `fromSeq`, and an optional abort signal.
  - `threadId` is now a required field wherever a run is created or looked up.
  - Terminal status names changed to match the shared `TerminalRunStatus`: `done` is now `completed`, `error` is now `failed`, `aborted` stays `aborted`. The event log that moved to `@tanstack/ai-sandbox-cloudflare` converged on the same vocabulary, with a live-data migration for records persisted under the old one (see below).

  `pipeToRunLog` is now total: it never rejects. `RunDeps.logger` is an optional sink for the failures the driver absorbs (a failing `runs.update`, a failing `durability.close()`, a record that vanished before the terminal re-read), because a detached run has no caller left to receive an error. Every exit path still terminalizes, so a store or log failure no longer leaves a run wedged at `'running'` with live tailers parked on a log that never closes.

  ### Breaking: `@tanstack/ai-sandbox-cloudflare`

  New home of the run event log. `@tanstack/ai-sandbox-cloudflare/agent` now exports `InMemoryRunEventLog` alongside the existing `DurableObjectRunEventLog`, plus the `RunEventLog`, `RunEvent`, and `RunEventLogReadOptions` types.

  The log now speaks core's run vocabulary rather than a legacy one of its own:
  - Statuses are core's `'running' | 'completed' | 'failed' | 'aborted'` (`done` → `completed`, `error` → `failed`), and `isTerminalRunStatus` is core's helper. Import `RunStatus` / `TerminalRunStatus` / `RunRecord` / `RunError` from `@tanstack/ai`; the package no longer exports run vocabulary of its own.
  - The record is **`RunLogRecord`** (exported from `./agent`): core's `RunRecord` — required `threadId`, `startedAt`/`finishedAt`, structured `RunError` — plus the two fields only an event log needs, the `lastSeq` cursor and the `updatedAt` activity clock.
  - `RunEventLog.open` requires `threadId` (and accepts an optional `startedAt`), matching core's `RunRecord`. The interface also gains `update` (a `RunStore`-shaped patch of the record's mutable fields; implementations must wake blocked readers, because a driver that terminalizes through its `RunStore` is ending the log with that call) and `list` (every record the log holds).
  - **The package no longer ships a run driver.** Its `pipeToRunLog`/`RunController` copy is deleted; `SandboxCoordinator` now drives runs with core's `RunController` from `@tanstack/ai-sandbox`, bound to the Durable Object log by two adapters exported from `./agent`: `runLogStore(log)` exposes the log as core's `RunStore`, and `runLogStream(log, { runId })` exposes one run of it as core's `StreamDurability` — so `alignToStoredLog`, `replayRunStream`, and the rest of the portable durable-runs machinery compose with the DO log directly. The coordinator's WebSocket tail and `?lastSeq` wire protocol are unchanged.
  - **Live-data migration.** Records a Durable Object persisted under the old layout (`{ status: 'done' | 'error' | …; createdAt; updatedAt; threadId? }`) are migrated **in place, on first read**, and written back so each record pays the conversion once: `done` → `completed`, `error` → `failed`, `createdAt` → `startedAt`, a terminal record gains `finishedAt = updatedAt`, and a record stored without `threadId` gets `threadId = runId` (the log runs no thread-scoped queries, so the self-reference cannot leak into thread history). Event rows (`evt:`) are raw chunks and are untouched. `migrateStoredRunRecord` is exported from `./agent` for bring-your-own-backend logs that persisted the old layout.
  - **Wire-visible.** `GET /runs/:id` and the coordinator's WebSocket terminal `status` frame now carry the converged status strings and field names. A client branching on `record.status === 'done'` must branch on `'completed'` (and `'error'` → `'failed'`).

  Durable streaming runs now survive a client disconnect (page reload) and can be
  tailed to completion by a rejoining client — no route-side detachment code
  required. Two internal fixes to `toServerSentEventsResponse` /
  `toHttpResponse`, both additive with no public API change:
  - **`RUN_STARTED` is a durability flush boundary.** One-shot generation
    activities (image, speech, transcription, summarize) emit `RUN_STARTED`, then
    await the provider for seconds, then a terminal. Previously `RUN_STARTED` sat
    in the batch buffer, so the durable log was empty for the whole run and a
    mount-time `joinRun` fast-failed as "run gone". It now flushes immediately, so
    the run is resumable from the instant it starts.
  - **The producer is decoupled from the HTTP response when durability is on.**
    A client disconnect used to abort the producer and seal the log with
    `RUN_ERROR`, even though the run kept running and recorded success. Now, on a
    durable (persistence-on) run, a response cancel detaches and the producer
    keeps draining into the log to its real terminal, so a rejoining client tails
    it to completion. This supersedes the earlier "producers terminalize the log
    on cancellation" behavior **for durable runs only**:
    - **No durability (persistence off)** → unchanged: a disconnect aborts and
      stops the run.
    - **Durability present (persistence on)** → the run survives a disconnect.
    - A genuine caller stop — aborting an `abortController` you pass (e.g. wired to
      `request.signal`, as the resumable-streams demo does) — still terminalizes
      the run, so opt-in die-on-disconnect keeps working.

  `durableStream` now resolves the run id exactly the way core does, through
  `resolveResumeRunId` from `@tanstack/ai`: the `X-Run-Id` header first, then the
  `?runId` query param. It previously read `?runId` only.

  Two consequences of the old query-only resolution are fixed:
  - A `@tanstack/ai-client` POST keeps its URL byte-identical to a plain chat
    request and carries the run id in `X-Run-Id`, so a POST producer route wired
    to `durableStream` wrote to a random-UUID stream while the GET attach route
    addressed the real one — the producing and attaching routes never met.
  - A mid-stream reconnect re-POSTs with `Last-Event-ID` and no `?runId`, which
    tripped the resume guard and threw `resume offset requires a runId`.

  **Behavior change:** a request that names no run at all — neither header nor
  query — now throws instead of generating a run id. A generated id names a stream
  no attach request could ever address, so the producer appeared healthy while
  writing where nobody could read. This matches `DurableRunIdRequiredError` in
  `@tanstack/ai-sandbox`. Pass the run id in `X-Run-Id` (what the client adapters
  send) or `?runId`.

  Make a reload rejoin fast, robust, and repeatable.
  - **`memoryStream` first-chunk deadline now defaults to 100ms** (was 30s). The
    common from-start join is a reload rejoining a run whose producer ran in a
    prior request: an in-flight run's log already holds chunks (it streams
    immediately, the deadline never applies), and an empty log means the run is
    gone — so failing fast lets the client re-enable input near-instantly instead
    of holding a dead connection open. Raise `firstChunkDeadlineMs` for a backend
    whose producer can legitimately start well after a joiner attaches.
  - **`ChatClient` reload rejoin hardened:** it bounds the wait for the first
    chunk and clears a dead resume pointer (so a stale pointer can't pin the UI in
    a loading state and can't be retried on the next load); it drops the hydrated
    in-flight partial only when real content arrives (never on `RUN_STARTED`
    alone), so a rejoin that connects but delivers nothing can't leave an empty
    assistant bubble; and it no longer lets a replayed `RUN_STARTED` (which
    carries the provider run id) overwrite the persisted resume pointer with an id
    the durability log isn't keyed by — so a SECOND consecutive reload still
    re-attaches and continues.

  Server-authoritative reconnect is now automatic and keyed on the thread, not the run.

  A chat's durable identity is its **thread**; run ids are ephemeral (a single turn
  can span several runs via interrupts or tool continuations), so basing reconnect
  on a client-cached run id goes stale the moment a turn rolls to a new run. This
  moves the whole reconnect story onto the stable thread id, resolved by the server.
  - **`RunStore.findActiveRun(threadId)`** — required store
    method returning the most recent `'running'` run for a thread. Implemented by
    the in-memory reference backend and covered by the conformance testkit, so any
    adapter that provides it is held to the same invariants (most-recent-running
    wins, thread-scoped, null when idle).
  - **`reconstructChat` now returns `{ messages, activeRun, interrupts }`** (was a
    bare message array): the stored transcript as UI messages, a cursor to an
    in-flight run if one exists, and any pending human-in-the-loop interrupts (tool
    approvals / waits) plus the run they paused. It reads the active run before the
    transcript so observing "no active run" guarantees the transcript is final
    (closing a finish-window race).
  - **`@tanstack/ai-client` hydrates itself on mount.** In server-authoritative
    mode (`persistence: true`) the client caches no transcript and no run
    pointer: on mount `useChat`/`ChatClient` calls the connection's new
    `hydrate(threadId)` (a JSON GET against the same endpoint), paints the returned
    transcript, and — if a run is in flight — tails it via the existing `joinRun`
    durability replay. A reload and the same thread opened on another device are the
    identical, server-resolved path. No loader, no `initialMessages`, no
    `initialResumeSnapshot`, no app-side fetching required.
  - **Interrupts reconstruct from the server too.** A paused approval (a tool with
    `needsApproval`) is restored from `reconstructChat`'s `interrupts` exactly as a
    persisted resume snapshot would be, so a reload — or another device — re-prompts
    the same approve/reject decision and resumes the run it paused. Previously the
    pending interrupt was only recoverable from client storage, so a fresh client
    showed the paused tool call with no way to resolve it.

  Apps keep the single GET endpoint they already have (durability replay when a
  resume cursor is present, else `reconstructChat`); everything else is handled by
  the hook.

  Fix `generateVideo` dropping result transforms and run identity, which made a persisted video restore as nothing.

  Streaming video was the only media activity that never called `applyGenerationResultTransforms`, and never put the caller's `threadId` / `runId` on the middleware context. Because `withGenerationPersistence` registers BOTH its artifact capture and its run-record `result` write as result transforms — pushed onto an optional `ctx.resultTransforms` — both silently no-opped. A completed video therefore stored a run record with `status: 'complete'` and nothing else: no result metadata, no artifact refs, no stored bytes, and no thread link (the run was filed under the internal `requestId`). On reload the client found no output artifact and restored nothing.

  Streaming video now applies the transforms to its terminal result before yielding it, so the `generation:result` chunk and the stored run record carry the same URLs — including the durable app-origin URL that `artifactUrl` stamps. It also passes `threadId`, `runId`, and `artifactInputs` into the middleware context, matching `generateImage`.

  `threadId` is now a documented option on `generateVideo` (it previously had none — callers passing one via an object spread type-checked but were silently ignored). When omitted, an id is still minted for the `RUN_STARTED` / `RUN_FINISHED` wire chunks, but the middleware context gets `undefined` rather than the minted value: a fabricated thread id is a slot no client can hydrate by, which is worse than recording no link at all.

  Fix generation mount hydration to run in the commit phase, and restore TTS
  results.
  - The `GenerationClient` / `VideoGenerationClient` used to kick off mount
    hydration from their constructor. Framework hooks build the client inside
    `useMemo`, so that ran in React's render phase, and several clients mounting
    together re-fired the hydrate GET on every discarded/speculative render,
    flooding the connection pool (`ERR_INSUFFICIENT_RESOURCES`). Hydration now runs once from `mountDevtools`
    (the hooks' commit-phase mount effect), guarded by `serverHydrationStarted`.
    Note for direct
    (non-framework) `GenerationClient`/`VideoGenerationClient` users: mount
    hydration and the "missing `hydrateGeneration` handler" warning now fire from
    `mountDevtools()` rather than the constructor, so call `mountDevtools()` (as
    every framework hook does on mount) to trigger a server/storage restore;
    `generate()` still triggers it too.
  - New `reconstructSpeechResult` mapper, wired into the speech hook of **every**
    framework package — `useGenerateSpeech` (React, Solid, Vue),
    `createGenerateSpeech` (Svelte) and `injectGenerateSpeech` (Angular). A
    restored `TTSResult` carries no base64 bytes (they live in the blob store), so
    it surfaces the durable serve URL through `result.artifacts`; the speech clip
    now repaints after a reload instead of showing status only. Previously only
    React was wired, so a restored TTS run on the other four repainted
    `status`/`error` but left `result` null.

  Generation persistence is server-driven only. The hooks' `persistence` option is
  now a boolean.

  ```diff
  - useGenerateImage({ threadId, connection, persistence: localStoragePersistence() })
  + useGenerateImage({ threadId, connection, persistence: true })
  ```

  A generation is one job with one result, not a growing transcript, so a browser
  copy of its record bought nothing that the server record does not already
  provide, and cost a second source of truth to keep in step. Worse, the two modes
  restored differently: a client snapshot can never hold the generated bytes, so
  `result` came back `null` from storage but whole from the server. One mode
  removes that split.

  Gone from `@tanstack/ai-client`: the `GenerationPersistence` type and the storage
  read/write path in `GenerationClient` and `VideoGenerationClient`.
  `persistence: true` still requires a stable `threadId` at the type level, and
  still needs a `hydrateGeneration` handler (every built-in connection has one)
  plus a `reconstructGeneration` route.

  The `initialResumeSnapshot` option went with it: it seeded the storage mode that
  no longer exists, so the server hydration handler is the only way a run is
  restored.

  **None of this touches chat.** `useChat` keeps both modes, and
  `localStoragePersistence` / `sessionStoragePersistence` / `indexedDBPersistence`
  are still exported and still work for conversations.

  Add generation persistence, mirroring chat: media generation runs survive a reload or dropped connection, restoring transparently into the normal hook fields, with optional durable storage of the generated bytes.

  **Generation run store (server).** `withGenerationPersistence` records each run in a dedicated `generationRuns` (`GenerationRunStore`) store, keyed by the run's own `runId` (the same AG-UI run id the client sends), with `threadId` the run's scope — it no longer overloads the chat `RunStore`. The record holds the activity/provider/model, lifecycle status, result metadata, and (when byte storage is on) the durable artifact refs. `memoryPersistence()` ships an in-memory `generationRuns` store, and `defineGenerationRunStore` / `defineArtifactStore` / `defineBlobStore` type a custom store inline the way `defineMessageStore` / `defineRunStore` already do.

  **Server-side load (`reconstructGeneration`).** A new `reconstructGeneration(persistence, request, options?)` server helper — the generation parallel of `reconstructChat` — reads a `?runId=` (or `?threadId=`) from the request, authorizes it via an `authorize` callback, and returns `{ resumeSnapshot, activeRun }` JSON so a server-authoritative client restores the last run on mount. Requires the `generationRuns` store. `authorize` is optional at the type level for single-user and prototype routes, but any multi-user deployment must pass it: the run and thread ids arrive from the caller, so identity has to be derived from server-side session state and ownership checked before the helper reads persistence. The same applies to a route that serves artifact bytes by id.

  **Media byte storage (server).** When the backend also provides both an `artifacts` (`ArtifactStore`) and a `blobs` (`BlobStore`) store, `withGenerationPersistence` writes each generated file's bytes to the blob store (key `artifacts/<runId>/<artifactId>`), records an `ArtifactRecord`, and attaches `PersistedArtifactRef`s to the result and the run record. A new `artifactUrl` option stamps a durable app-origin serve URL onto each ref (a new `PersistedArtifactRef.url`) and rewrites the live result's media URL to it, so live and restored results both render media from your own origin instead of the provider's expiring link. Extraction is customizable via `extractArtifacts` / `nameArtifact`; `retrieveArtifact` / `retrieveBlob` (which resolve the key through `resolveArtifactBlobKey`) serve the bytes back. Prompt media referenced by **URL** is not downloaded: the URL is caller-supplied, so fetching it server-side would be an SSRF vector, and the bytes are redundant. Opt in per-app with `allowInputUrl` (a predicate, so the check can't be skipped). Every artifact fetch is limited to `http:`/`https:`, timed out (`artifactFetchTimeoutMs`, default 30s) and size-capped (`maxArtifactBytes`, default 100 MiB); input fetches additionally block loopback/private/link-local hosts and refuse redirects. `artifactFetch` injects the `fetch` used, for routing downloads through an egress-restricted proxy. `memoryPersistence()` ships in-memory `artifacts`/`blobs` stores; the generation activities gained `threadId` / `runId` options. `@tanstack/ai-utils` adds `base64ToUint8Array`.

  **Client (transparent restore).** Generation hooks (`useGenerateImage`, `useGenerateVideo`, `useGenerateAudio`, `useGenerateSpeech`, `useGeneration`, `useSummarize`, `useTranscription`, and their Solid/Vue/Svelte/Angular equivalents) take a `persistence` option, and it is boolean — server-driven only, with no client-storage adapter arm: `true` hydrates the last run for a stable `threadId` on mount, and the browser caches nothing. Restore is **invisible**: it repaints the normal `result` / `status` / `error` fields as if the run had just finished, and reports the in-flight run's id as `runId` — there is no `resumeSnapshot` / `resumeState` / `pendingArtifacts` / `resultArtifacts` hook field. If a run is still generating when the connection drops or the page reloads, the client re-attaches to it and finishes it in place (via the connection's `joinRun` durability replay), exactly like `useChat`. With byte storage configured, a restored `result` is rebuilt whole, its media resolved to the durable serve URL and its refs on `result.artifacts`; without it, `status` / `error` restore and `result` stays null. The snapshot never holds the generated bytes and never restarts provider work — generation still only begins on `generate(...)`.

  **`threadId` is required whenever `persistence` is set**, enforced at the type level. It is the generation's _scope_ — a stable, app-chosen name for the slot successive runs fill (`product-123-hero`, `video-9-start-frame`) — not a link to a chat conversation, so a workflow generating media outside any conversation names it just as naturally. It stays optional for ephemeral generations, so existing call sites that do not opt into persistence are unaffected. Persistence keys on `threadId` and nothing else; the legacy `id` is deprecated and typed `never` whenever `threadId` is supplied — pass one scope, not two. Previously the key fell back to `id` and then to a generated id, which silently wrote a different slot on every reload — restoring nothing while orphaning the last record.

  **Choose where bytes land.** `withGenerationPersistence`'s new `storageKey` option maps each artifact to its blob-store key, so generated media can live in your own folder structure instead of the default `artifacts/<runId>/<artifactId>`. Server-side only — a browser-supplied key would be a path-traversal and cross-tenant-write vector. The resolved key is recorded on the new `ArtifactRecord.blobKey` (it is no longer derivable once arbitrary) and reads resolve through `resolveArtifactBlobKey`; records written before the field existed fall back to the default convention, so it is a non-breaking addition.

  `findLatestForThread` is a **required** method on `GenerationRunStore` — a `?threadId=` lookup is the whole mount-time hydration path, so a store that cannot answer it cannot back generation persistence. TypeScript rejects a store that omits it; a JavaScript adapter that ships without it fails at the call, not silently.

  Snapshots arriving from the server are validated before anything is repainted, so a stale or malformed record cannot paint a bogus result.

  A generation mount-time rejoin that can't finish now settles to `error` instead
  of hanging on `generating`.
  - `recordResumeSnapshotError` surfaces `error` on the observable `status` even
    when a streamed `RUN_ERROR` already flipped the resume snapshot to `error`
    (via `observeResumeSnapshot`). Previously its early-return skipped
    `setStatus`, so a rejoin whose delivery log had aged out (or whose route
    couldn't serve the join) left the hook stuck on `generating` forever. Guarded
    so the live `generate()` path doesn't double-emit `error`.
  - `GenerationClient` / `VideoGenerationClient` `dispose()` no longer calls
    `stop()`: a teardown (unmount / React StrictMode dispose) must not mark the
    run non-resumable and wipe the `running` snapshot the way a user-driven
    `stop()` intentionally does — that destroyed the resume state so a remount
    could never rejoin. It now aborts only the in-flight delivery, keeps
    the snapshot resumable, and re-arms mount hydration so a remount rejoins.

  `GenerationRunStatus` now uses the same vocabulary as chat's `RunStatus`.

  ```diff
  - type GenerationRunStatus = 'running' | 'complete' | 'error' | 'interrupted'
  + type GenerationRunStatus = RunStatus // 'running' | 'completed' | 'failed' | 'interrupted'
  ```

  The two enums described the same four lifecycle states under different names,
  `complete` against `completed` and `error` against `failed`, for no reason
  either one could point at. An adapter storing both kinds of run had to keep two
  status vocabularies straight, and a shared `status` column needed two sets of
  checks. They are now one type, so one column and one check constraint cover both
  tables.

  If you wrote a `GenerationRunStore` against the old names, update the two
  literals your store maps or validates. `running` and `interrupted` are
  unchanged. The conformance suite round-trips both new literals — it writes
  `completed` and then `failed` through `update` and reads each back through
  `get` — so re-running it against your adapter will catch anything missed.

  The client-facing resume-snapshot status is **unchanged**
  (`idle | running | complete | error`). It is a separate vocabulary with its own
  `idle` state, mapped from the store status by `reconstructGeneration`, exactly
  as chat maps `RunStatus` to `ChatClientState`. Nothing on the wire moves.

  Also corrected: `GenerationRunRecord.threadId` was documented as an "optional
  link to the chat conversation that triggered this generation", and typed
  optional to match. It is the slot the run fills, the stable app-chosen key
  `findLatestForThread` hydrates by, and `withGenerationPersistence` refuses to
  start a run without one — so the field is now **required**. A record written
  without a scope could never be found again, which is not a shape worth keeping
  representable.

  `GenerationRunRecord.threadId` is now required.

  ```diff
    interface GenerationRunRecord {
      runId: string
  -   threadId?: string
  +   threadId: string
      …
    }
  ```

  `GenerationRunStore.createOrResume` requires it on its input, and the
  `resumeState` cursor on the hydration payload (`ReconstructedGeneration`,
  `GenerationHydrationResult`) narrows from `{ threadId?: string; runId: string }`
  to `{ threadId: string; runId: string }`.

  **Why.** The optional field described a record no code path could produce and no
  client would accept. `withGenerationPersistence` already refused to start a run
  without a scope, so every record the library writes has one.
  `findLatestForThread` — the only query that hydrates a generation — keys on it,
  so a record without one could be written and then never read back. And the
  client discarded any snapshot that arrived without one.

  That last disagreement was a silent failure: the server legitimately omitted
  `threadId` for a record that had none, and the client's snapshot validation
  responded by dropping the **entire** snapshot (status, result and error along
  with the cursor), leaving a blank idle panel with no diagnostic while the
  provider kept billing. Making the field required removes the disagreement by
  construction rather than patching one side of it.

  **Migration.** If you wrote a `GenerationRunStore`, make the column non-nullable
  and stop defaulting the field to `null`/`undefined`. The conformance suite now
  asserts `threadId` round-trips exactly and is not mutated by an idempotent
  `createOrResume`, so re-running it against your adapter will catch anything
  missed. Records already stored without a `threadId` were unreachable by
  `findLatestForThread`, so there is nothing to backfill for hydration to work —
  delete them or assign them a scope.

  `withGenerationPersistence` reads `threadId` from the activity instead of
  requiring it twice.

  ```diff
  - generateImage({ threadId, middleware: [withGenerationPersistence(p, { threadId })] })
  + generateImage({ threadId, middleware: [withGenerationPersistence(p)] })
  ```

  **The bug underneath (`@tanstack/ai`).** Four streaming activities spread the
  resolved wire identity over their own options:

  ```diff
  - (resolved) => runGenerateImage({ ...options, ...resolved })
  + (resolved) => runGenerateImage({ ...options, runId: resolved.runId })
  ```

  `streamGenerationResult` mints a thread id for the `RUN_*` chunks when the caller
  passes none, so that spread overwrote the caller's `threadId` with an id known to
  nobody. `generateImage`, `generateAudio`, `generateSpeech`, and
  `generateTranscription` were all affected; `generateVideo` already did this
  correctly. Any middleware reading `ctx.threadId` on those four saw a fabricated
  value it could not tell apart from a real one, which is why persistence ignored
  the context and demanded the option.

  **The option (`@tanstack/ai-persistence`).** `WithGenerationPersistenceOptions.threadId`
  is now optional, and an override rather than the only source. The scope resolves
  to `opts.threadId ?? ctx.threadId`, and a run with neither throws a named error
  at `onStart` instead of being filed somewhere nothing can hydrate it from. Code
  that passes `threadId` to both keeps working unchanged.

  The redundancy was also a trap: passing different values to the activity and the
  middleware silently split one slot in two, with the wire using one id and the
  record filed under the other.

  `InjectChatOptions` no longer exposes `onResumeStateChange`.

  `injectChat` surfaces the run identity as the `runId` signal and pending
  interrupts through `interrupts` / `pendingInterrupts` / `onInterruptStateChange`,
  exactly like React / Solid / Vue / Svelte / Preact — but Angular's omit list was
  missing the key, so `onResumeStateChange` leaked as a public option and
  `injectChat` forwarded to it. Both the key and the forwarding are gone; a caller
  passing it now gets a type error instead of depending on an option no other
  framework offers.

  **Breaking:** the hooks expose `runId` instead of `resumeState`.

  ```diff
  - const { resumeState } = useChat({ threadId, connection })
  - const liveRunId = resumeState?.runId ?? null
  + const { runId } = useChat({ threadId, connection })
  ```

  Every chat hook (`useChat` / `createChat` / `injectChat`) and every generation
  hook (`useGenerateImage`, `useGenerateVideo`, `useGenerateAudio`,
  `useGenerateSpeech`, `useGeneration`, `useSummarize`, `useTranscription` and the
  Solid / Vue / Svelte / Angular equivalents) now returns `runId: string | null` —
  the id of the run streaming right now, or `null` when nothing is in flight.

  `resumeState` was a `{ threadId, runId }` pair whose `threadId` half was always
  the id the caller had just passed in, so the only new information it carried was
  the run id, wrapped in an object that had to be unwrapped and null-checked.
  `runId` is the thing callers actually reach for: the handle you send to your own
  endpoint to cancel or poll a provider job, since `stop()` only aborts the local
  stream and does not stop work already running on the provider.

  On chat it also reports **more** than `resumeState` did. `resumeState` only ever
  held a run that was interrupted or being rejoined, so it stayed `null` through an
  ordinary streaming turn. `runId` tracks every run: it is set when any run starts
  (including a rejoin) and cleared when it settles, backed by the new
  `ChatClient.getCurrentRunId()`.

  `injectChat` (Angular) exposed no equivalent field before and now returns `runId`
  alongside the other frameworks.

  `ChatResumeState` remains exported, since `resumeInterruptsUnsafe` still takes
  one. It is simply no longer part of a hook's return shape.

  New docs page: [Id map](https://tanstack.com/ai/latest/docs/persistence/id-map)
  covers what each id means on chat versus generation, how to choose a `threadId`,
  and when to read `runId`.

  Correct the `persistence` / `threadId` JSDoc on every generation hook.

  `persistence` is now `boolean`, but the tooltip still described a third value —
  "a storage adapter: client-driven — the lightweight snapshot is cached under
  `generation:<threadId>`" — left over from the deleted client-side persistence
  surface, and `threadId` still claimed persistence keys on it "in **both**
  modes". IDE tooltips on a public option were telling users to pass something
  the types reject. Both now describe the server-driven-only behaviour, and
  `threadId` documents that the persisted record requires it (as does
  `withGenerationPersistence` on the server).

  Make interrupt ownership explicit rather than assumed.

  An AG-UI `Interrupt` is a shared envelope — a workflow engine's durable
  approval or another agent framework's pause can arrive on the same stream. What
  makes a pause resumable through `chat()` is the binding this package attaches
  under `tanstack:interruptBinding`.
  - Interrupts that carry no binding this client understands now surface as
    `kind: 'unbound'` with `canResolve: false`, instead of being given a
    synthesized binding and rendered as resolvable generic interrupts. Resolving
    those produced an answer submitted against a run with nothing pending, which
    failed as `unknown-interrupt` only after the user had filled in the form.
    Unbound items never block submission of the interrupts that are yours.
  - The binding carries a wire version (`INTERRUPT_BINDING_VERSION`). Readers
    reject a version they don't recognise rather than duck-typing its fields. A
    binding written before the field existed is still read.
  - `INTERRUPT_BINDING_METADATA_KEY`, `withInterruptBinding()` and
    `readInterruptBinding()` are exported, so anything producing an interrupt this
    package must later resume attaches the binding through a supported API
    instead of copying the metadata key.
  - Interrupt classification is driven by the binding alone. `Interrupt.reason` is
    free-form AG-UI text another producer can also use, so it is now a display
    hint only and never decides ownership.
  - The interrupt protocol surface is enumerated instead of `export *`. The
    unimplemented durable-recovery contract (`InterruptRecoveryStateV1`,
    `InterruptRecoveryQuery`, the never-called `loadInterruptState` adapter hook,
    and the `persistence-required` / `atomic-commit-unsupported` /
    `recovery-unavailable` error codes) is removed rather than published.

  Interrupts: the application owns wire-schema validation, and the hashing
  dependency is gone.

  The library no longer transforms a generic interrupt's wire JSON Schema into a
  validator or validates the resolved value against it, on either the client or
  the server. Whatever you pass to `resolveInterrupt` (client) or send in the
  `resume` batch (server) flows through as-is. Validate it yourself if you need to
  trust it, e.g. with `z.fromJSONSchema(interrupt.responseSchema).safeParse(value)`
  on the client and your own check on the server. Validation of a tool's
  code-authored Standard Schema (`approvalSchema` / `inputSchema`) is unchanged.

  This drops the `ajv` and `ajv-formats` dependencies. Interrupt binding hashes and
  resolution fingerprints now use a small bundled SHA-256 instead of
  `@noble/hashes`, so that dependency is gone too. The wire hash shape
  (`sha256:<hex>`) is unchanged.

  `localProcessSandbox` no longer leaks a process per killed command on Windows.

  `killTree` ran `taskkill /PID <sh> /T /F` and returned as soon as `spawnSync`
  reported no `error` — treating "I successfully asked" as "it died". Two things
  were wrong with that, and the second is the one that actually leaked.

  **It never checked taskkill's exit status.** A launched taskkill is not a
  successful taskkill. A genuine refusal (access denied, a protected process) was
  indistinguishable from a kill that worked.

  **`taskkill /T` cannot reach the process anyway.** Commands run through a
  git-bash `sh`, and MSYS's fork emulation runs the final command of a statement
  list — such as the `tail -f` behind a journal follow read — under an intermediate
  shell that immediately exits. Windows never reparents, so the surviving
  `tail.exe` points at a dead parent, and `taskkill /T` walks only live parent
  links. It misses the process **and still exits `0`**, which is why checking the
  exit status alone would not have caught this either. Measured on Windows 11: the
  journal conformance suite leaked 2 processes per run and the takeover suite 4,
  accumulating for the life of the machine. Streaming was unaffected (the reader
  honors its own `AbortSignal` rather than waiting for the kill), so it failed
  silently and cumulatively and no test ever went red.

  `killTree` now resolves the tree through MSYS's own process table — which does
  keep the logical parentage — **before** killing, since the taskkill destroys the
  only link back to our shell, then verifies each descendant is gone and kills the
  survivors directly. Both suites now leak 0. A process that had already exited on
  its own is recognized as success, not retried and not reported.

  Teardown remains total by construction: nothing here throws, because a throwing
  kill would strand a run mid-flight with its readers parked. That makes an
  unkillable process otherwise invisible, so `localProcessSandbox` accepts a
  `logger`:

  ```ts
  const dev = localProcessSandbox({
    logger: { warn: (message, meta) => console.warn(message, meta) },
  })
  ```

  Any object with a `warn(message, meta?)` method satisfies the new
  `LocalProcessLogger`, including the `InternalLogger` an adapter already holds.

  Nothing changes on POSIX, where `sh` really is the command's parent and
  signalling the wrapper suffices.

  Move multi-instance **locks** to `@tanstack/ai` under a dedicated `@tanstack/ai/locks` subpath, and nest persistence agent skills like `ai-core`.
  - **`LockStore` / `InMemoryLockStore` / `LocksCapability` / `getLocks` / `provideLocks` / `withLocks`** live in `@tanstack/ai/locks` (not the main `@tanstack/ai` barrel, and not `@tanstack/ai-persistence`).
  - `@tanstack/ai-sandbox` consumes the core `LocksCapability` token (no local lock re-export).
  - The locks agent skill moves with the code: `ai-core/locks` in `@tanstack/ai`, not `ai-persistence/locks`.
  - Agent skills under `@tanstack/ai-persistence` nest as `skills/ai-persistence/{stores,server,build-*-adapter}/`.
  - Docs: locks guide under advanced middleware.

  Rework tool-call fan-out budgets as middleware hooks (unreleased [#965](https://github.com/TanStack/ai/issues/965) API).
  - **Remove** (never released): `maxToolCalls()` strategy and `chat({ maxToolCallsPerTurn })`
  - **Add** `onShouldContinue` middleware hook so policies can stop further agent turns without aborting
  - **Keep** `AgentLoopState.toolCallCount` / `lastTurnToolCallCount` for strategies and middleware
  - Tool-call budgets are an **app-owned middleware recipe** (docs), not a built-in export

  ```ts
  import { chat, maxIterations, type ChatMiddleware } from '@tanstack/ai'

  function toolCallBudget({
    max,
    maxPerTurn,
  }: {
    max?: number
    maxPerTurn?: number
  }): ChatMiddleware {
    let perTurn = 0
    return {
      onIteration: () => {
        perTurn = 0
      },
      onToolPhaseComplete: () => {
        perTurn = 0
      },
      onBeforeToolCall: () => {
        if (maxPerTurn == null) return
        if (++perTurn > maxPerTurn) {
          return {
            type: 'skip',
            result: {
              error: `Skipped: exceeded maxToolCallsPerTurn (${maxPerTurn})`,
            },
          }
        }
      },
      onShouldContinue: (_ctx, state) =>
        max != null && state.toolCallCount >= max ? false : undefined,
    }
  }

  chat({
    adapter,
    messages,
    tools,
    agentLoopStrategy: maxIterations(20),
    middleware: [toolCallBudget({ maxPerTurn: 10, max: 20 })],
  })
  ```

  **Add server-side memory via a `recall`/`save` adapter contract in `@tanstack/ai-memory`.**

  Memory is now a single, provider-agnostic contract with two verbs — `recall` and
  `save` — which is the shape every memory backend (in-process, Redis, and hosted
  vendors) naturally exposes. `memoryMiddleware` recalls relevant memory into the
  system prompt (and optionally injects vendor tools) before the model runs, then
  defers `save` of the finished turn via `ctx.defer` so streaming is never blocked.
  Extraction, ranking, and rendering live inside each adapter — the middleware is thin.

  `@tanstack/ai-memory` (new package) — everything ships here:
  - Root: `memoryMiddleware`, the `MemoryAdapter` contract
    (`recall` / `save` / optional `inspect` / `listFacts`), and the `MemoryScope` /
    `MemoryTurn` / `RecallResult` / `SaveReceipt` types.
  - `@tanstack/ai-memory/in-memory` → `inMemory()` — zero-dependency adapter for dev,
    tests, and single-process demos. Pass an `embedder` for semantic scoring and/or an
    `extract` function to persist derived facts.
  - `@tanstack/ai-memory/redis` → `redis({ redis, prefix? })` — production adapter for
    plain Redis. `ioredis` wires in directly; `redis` (node-redis v4+) via the
    `fromNodeRedis(client)` wrapper. Both are optional peer dependencies.
  - `@tanstack/ai-memory/hindsight` → `hindsight()`, `@tanstack/ai-memory/mem0` →
    `mem0()`, `@tanstack/ai-memory/honcho` → `honcho()` — hosted-vendor adapters. Their
    SDKs (`@vectorize-io/hindsight-client`, `@honcho-ai/sdk`) are optional peers loaded
    lazily; mem0 talks to its server over plain HTTP (no SDK). Vendors can expose LLM
    tools through `recall` (e.g. hindsight's retain/recall/reflect).
  - A shared `recall`/`save` contract-test suite (`@tanstack/ai-memory/tests/contract`)
    that any adapter — including third-party ones — can run.

  `@tanstack/ai`:
  - **Removes the (unreleased) `@tanstack/ai/memory` subpath.** The middleware,
    contract, and helpers all moved to `@tanstack/ai-memory`.

  `@tanstack/ai-event-client`:
  - The five `memory:*` devtools events (`memory:retrieve:started` / `:completed`,
    `memory:persist:started` / `:completed`, `memory:error`) now carry recall/save
    payloads (adapter id, fragment/receipt counts, `phase: 'recall' | 'save'`).

  **Align `MemoryScope` to the shared `Scope` type (`threadId`).**

  `MemoryScope` is now an alias of `Scope` from `@tanstack/ai` so memory and
  persistence share one isolation vocabulary. The conversation key is
  `threadId` (required); optional dims are `userId`, `tenantId`, and reserved
  `namespace`. There is no public `sessionId` on memory scope — hard cut while
  `@tanstack/ai-memory` is still `0.x` / unreleased.
  - `@tanstack/ai-memory` — `export type MemoryScope = Scope`. Built-in adapters
    (`inMemory`, `redis`) and middleware use `threadId`; `sameScope` also matches
    `tenantId` when present on the query. Redis index keys are now
    `{prefix}:index:{tenantId|_}:{userId|_}:{threadId}` (escaped). Hindsight banks
    use `{user}__{threadId}`. Anyone who wrote Redis rows under the pre-rename
    layout needs to reindex or wipe — keys are not dual-read.
  - `@tanstack/ai-event-client` — `MemoryScopeLite` is
    `{ threadId?, userId?, tenantId? }` (devtools telemetry; not an isolation
    authority).
  - `@tanstack/ai-client` / `@tanstack/ai-devtools-core` — memory event payloads
    and the Memory panel registry follow the same `threadId` field names.

  Fix `memoryStream` truncating a tool-calling (agent-loop) run at its first tool
  call.

  An agent-loop run emits one `RUN_STARTED`/`RUN_FINISHED` pair per iteration
  (`finishReason: "tool_calls"` for a turn that calls a tool, then `"stop"` for the
  final answer). `memoryStream` treated the _first_ terminal chunk as the end of
  the log — both marking the log complete on append and ending the reader on read —
  so a run that called a tool was delivered only up to that first `RUN_FINISHED`:
  the tool result and everything after (the model's actual answer) never reached
  the client, leaving the tool call stuck "running" and the reply missing, on the
  initial stream and on any reconnect/reload.

  Completion is now driven solely by the producer calling `close()` (which it does
  on every exit — the documented `StreamDurability.close` contract, honored by
  `toServerSentEventsResponse`/`resumeServerSentEventsResponse` and detached
  producers). The reader tails across per-iteration terminals and ends when the
  producer closes, so a tool-calling run is delivered in full — live, on rejoin,
  and on a server-authoritative reload.

  A throwing middleware terminal hook no longer cancels every other middleware's teardown.

  `onFinish`, `onAbort`, and `onError` were fanned out in an unguarded `for` loop, so the first hook to throw skipped every middleware ordered after it. These are the hooks that release per-middleware resources — `withSandbox`'s `onAbort` detaches or destroys the sandbox and stamps `detachedSince`; `withPersistence`'s `onAbort` records the run's status through the store — so one transient store error leaked a sandbox permanently, for every middleware behind it in the chain. `runOnAbort` is additionally awaited from `chat()`'s `finally`, where a throw also replaced the original abort reason with the hook's error.

  All three fan-outs now give **every** middleware its turn: a throw is captured, logged on the `errors` channel (never invisible), and the loop continues. Instrumentation only reports the hooks that actually completed.

  **Isolation does not mean silence, and the three hooks differ in who reports:**
  - **`onFinish` reports.** It is the only terminal fan-out on the success path, and it is where `withPersistence`'s `onFinish` saves the assistant turn. The collected failures are therefore rethrown **after** the loop: a single failure as-is (so the store's own message, `cause` and `code` reach the caller and the wire), several as an `AggregateError`. Previously they were swallowed, and a failed `messages.append` left a `completed` run record for a turn that never reached storage with a middleware log line as the only trace anywhere.

    This fan-out is awaited **after** the run's `RUN_FINISHED` has already been streamed, so the rethrow can only append to what the consumer saw, never retract it — and what it achieves differs per transport:
    - **Without durability**, the throw escapes mid-response and the SSE / HTTP-stream encoder emits a **trailing `RUN_ERROR`** carrying the store's own message and `code`. `ai-client` surfaces that as an error status, so the user is no longer told the turn was saved when it was not.
    - **With durability**, the throw reaches the **durability sink**, which records it server-side and leaves the already-forwarded `RUN_FINISHED` standing rather than appending a contradictory second terminal. That is intended: the _save_ failed, not the run — the client did receive the complete stream. The improvement is that the sink observes the failure at all; before, it never did.

  - **`onAbort` and `onError` swallow, after logging.** Both run once the outcome is already decided and already being reported — the abort reason, or the run's real error, which `chat()` rethrows the moment the fan-out returns. A propagated hook throw there could only _displace_ that outcome with a teardown artifact, so it stops at the log.

  **`onChunk` and `onConfig` are deliberately NOT guarded.** They are transform hooks in the middle of the data path: swallowing a throw there would forward a chunk or a config the middleware had decided to reject, silently producing wrong output rather than a failed run. A throw from either still fails the stream, which is the correct behavior — so a middleware doing anything fallible inside `onChunk` or `onConfig` still has to handle its own errors.

  feat(ai-client): only the chat on screen holds a stream — `attach()` / `detach()`

  **Behavior change for direct `ChatClient` users.** Tailing no longer starts in the
  constructor. If you construct `ChatClient` yourself, call `client.attach()` when your
  view appears and `client.detach()` when it goes. Every framework package in this repo
  does it for you, so `useChat` (React, Vue, Solid, Svelte, Preact) and `injectChat`
  (Angular) users need no change.

  Why it had to move out of the constructor: a UI framework may build a client and then
  throw it away — React does on a double-invoked render. A discarded client is never
  mounted, so nothing ever calls `detach()` or `dispose()` on it, and a connection its
  constructor had opened could never be closed. Traced with CDP: connection ids
  1374/1396/1428/1437 were still held after eight thread switches, and a later request
  waited 210 SECONDS for a free slot (`stallMs: 210752`). No guard inside the client can
  fix that, because every guard runs on the instance the framework KEPT — the leak is in
  the instance it discarded. Only "idle until a view attaches" makes a thrown-away
  client harmless.

  A page can own many chats. Forty sandbox runs, or forty conversations, is a normal
  shape for this SDK. A browser allows only about six connections per origin, and
  each tailed run holds one for as long as the run lasts. So a handful of views is
  enough to consume every slot, and then every other request QUEUES: measured in the
  sandbox example, a fetch issued from the page took **93 seconds**, while the exact
  same request from outside the browser took **17 milliseconds**. The visible effects
  were a message vanishing from the transcript, no UI updates until a run finished,
  and a page reload that took 40 seconds.

  Tailing used to begin only in the `ChatClient` constructor, so a view could never
  stop tailing and later resume — unmount had to either keep the connection open or
  lose the run for good. Keeping it open is what starved the page.

  `ChatClient` now has a lifecycle pair:
  - **`attach()`** — start tailing (rejoin an in-flight run, hydrate if
    server-authoritative). Idempotent, so a wrapper's mount after construction is free.
  - **`detach()`** — drop the connection and keep everything else: transcript, resume
    pointer and run id all survive, so re-entering the view repaints instantly and
    re-tails from the durable log.

  `detach()` is deliberately neither `stop()` (which means the user ended the run) nor
  `dispose()` (which means the client is finished). It says only that nobody is
  watching right now.

  **Costs nothing for a chat that is not persisted.** Both actions in `attach()` are
  gated: the rejoin needs a persisted run pointer, and the hydration needs
  server-authoritative mode. An ephemeral chat issues no request when its view mounts
  or re-mounts.

  The React, Preact and Svelte wrappers now release the connection the moment their
  view unmounts. They previously deferred teardown through a timer that a re-mount
  could cancel — correct for disposal, useless for a connection. Svelte had no
  automatic cleanup at all and required the app to call `stop()` by hand.

  Solid, Vue and Angular already dropped the connection immediately on unmount; they
  now also `attach()` on mount, because the constructor no longer does. The generation
  and video hooks already revived on mount through `mountDevtools()` and disposed
  immediately on unmount, so those are unchanged.

  Also fixed: a hydration request that resolved AFTER its view was disposed went on to
  open a tail on a dead client, which nothing could ever abort — one leaked connection
  per thread switch.

  Drop `temperature` / `top_p` for OpenAI reasoning models so they don't 400.

  The o-series and the GPT-5 reasoning family reject `temperature`/`top_p`
  (`400 Unsupported parameter`), but a caller — or the summarize adapter's
  low-temperature default — has no way to know a given model does. The OpenAI text
  adapter now strips both for reasoning models (matched by
  `openAIModelRejectsSamplingParams`, which covers `o*` and non-`*-chat-latest`
  `gpt-5*` plus `codex-mini-latest`). Stripping only ever averts a guaranteed 400,
  so it never changes an otherwise-valid request. This fixes `summarize` (and chat)
  on `gpt-5.5` and other reasoning models.

  Add server-side persistence for `chat()`: durable thread messages, run records, and interrupts.

  `withPersistence(persistence)` is a chat middleware that stores the conversation transcript, tracks each run's status, and records interrupt state so a paused run (tool approval, client-tool execution, generic interrupt) survives a server restart.

  `@tanstack/ai-persistence` ships the **contract**, not a backend for your database:
  - The four store interfaces — `MessageStore`, `RunStore`, `InterruptStore`, `MetadataStore` — with the invariants the middleware depends on (full-replace `saveThread`, idempotent `createOrResume`, insert-if-absent interrupt `create`, `requestedAt`-ascending listings).
  - The `withPersistence` / `withGenerationPersistence` middleware, plus `composePersistence` to assemble stores that live in different systems.
  - `memoryPersistence()`, an in-process reference backend for dev and tests.
  - `LockStore` / `withLocks` / `InMemoryLockStore` for cross-worker coordination — deliberately **not** a state store, and not composable through `composePersistence`.
  - A shared conformance testkit at `@tanstack/ai-persistence/testkit`. `runPersistenceConformance` exercises every method of every store you provide and fails loudly on a store that is missing without being declared in `skip`.

  Implement the stores against whatever database you already run and hand the result to `withPersistence` — the core never inspects your tables, so the schema stays yours. The [Build Your Own Adapter](https://tanstack.com/ai/latest/docs/persistence/build-your-own-adapter) guide walks through a complete `node:sqlite` backend end to end, and the package ships Agent Skills with worked Drizzle, Prisma, and Cloudflare D1 recipes (`npx @tanstack/intent@latest install`). `examples/ts-react-chat` runs on a self-contained `node:sqlite` adapter built this way and verified by the conformance testkit.

  Resume reconstruction is delegated to the chat engine: persistence records interrupts and gates new input on a thread with pending interrupts, while the engine rebuilds the resume tool state from the resume batch and the interrupt bindings carried in the (server-loaded) message history.

  `reconstructChat(persistence, request)` is a server helper that returns a thread's stored messages as a JSON `Response`, so a server-authoritative client can hydrate its transcript on load from a one-line `GET` handler.

  Streamed artifact bodies can now be persisted to length-strict blob stores (Cloudflare R2), `maxArtifactBytes` can be turned off, and `BlobStore.get` can serve byte ranges.

  **The bug.** URL-fetched artifacts arrived at `BlobStore.put` as a `TransformStream`-wrapped body — the wrapper that enforces `maxArtifactBytes` as the body drains. A transform's readable side carries no declared length, so runtimes that require one for a single-shot upload (workerd's `R2Bucket.put`) rejected every URL-sourced artifact with `TypeError: Provided readable stream must have a known length`. Byte bodies never hit this, which is why the old conformance suite (byte bodies only) and any store that buffers were unaffected.

  **The wrapper is now applied only when it is load-bearing.** A trustworthy `content-length` is checked against the cap up front, and HTTP framing holds the origin to it — a body cannot exceed a length it declared — so counting the bytes again adds nothing and costs the declared length. Those responses (the common case for a provider CDN) now reach `BlobStore.put` exactly as `fetch` produced them, length intact, so `R2Bucket.put` single-shots them with nothing buffered. The counter still wraps the two response shapes that genuinely need it: a chunked reply (no declared length at all) and a content-encoded one (whose declared length measures the compressed bytes, so the decoded stream can be a decompression bomb).

  **`BlobPutOptions.expectedLength` (additive).** `withGenerationPersistence` now forwards the artifact's exact decoded byte length to `BlobStore.put` when it is known — the `content-length` of an un-encoded artifact response. It is deliberately _not_ forwarded when the response is content-encoded: `fetch` transparently decompresses, so a gzipped reply's `content-length` is the compressed size and the decoded stream can be arbitrarily longer. Stores may use the hint to attach a declared length (e.g. workerd's `FixedLengthStream`) and single-shot the stream, or fall back to multipart when it is absent. Also fixed in the same code: a missing `content-length` header read as a declared length of `0` (`Number(null) === 0`), which kept the early-reject unreachable for chunked replies.

  **`BlobStore.get(key, { range })` (additive).** Serving a persisted video means answering HTTP `Range` requests: seeking a `<video>` is built on `206` / `Content-Range`, and Safari refuses to play a source that ignores `Range` entirely. `get` now takes a `BlobGetOptions` with a `range`, returns just that slice, and reports it as `BlobObject.range` while `size` keeps describing the whole object — the numbers a `206` needs. `retrieveBlob(persistence, artifact, { range })` passes it through, and two new helpers cover the fiddly halves: `parseRangeHeader(header, size)` resolves a `Range` header (suffix ranges, clamping, and the `416` case) for a serve route, and `resolveBlobRange(size, range)` does the clamping every byte-storing backend needs. Ranged reads are part of the contract for a store that holds bytes: the `get` signature stays source-compatible (the parameter is optional), so an existing custom store surfaces this as a conformance failure rather than a type error.

  **`maxArtifactBytes: false`, and a 1 GiB default** (was 100 MiB). The cap is a drain-time counter, not a buffer — the URL path streams into the blob store and never holds an artifact in memory — so it bounds _transfer_, not memory, and 100 MiB was simply too low for generated video. Passing `false` drops the ceiling and the wrapper on every response, including chunked ones. Keep the cap when `allowInputUrl` lets callers name the URL, or when you want any ceiling at all on what a runaway origin can stream into your bucket (`content-length` is advisory, so uncapped is unbounded).

  **Testkit.** `runPersistenceConformance` now exercises `blobs.put` with a length-less `TransformStream`-wrapped body — with and without `expectedLength` — and `blobs.get` with a byte range, so a store that only handles byte bodies or ignores ranges fails the suite instead of failing on first real use. Custom backends should re-run the suite.

  **Skill fix.** `ai-persistence/build-cloudflare-artifact-store` no longer claims the body "flows straight through" to `R2Bucket.put`: its R2 `BlobStore.put` recipe now re-declares `expectedLength` via `FixedLengthStream` and falls back to a one-part-at-a-time multipart upload when the length is unknown, and its `get` maps `range` onto R2's own ranged read.

  Add `reapDetachedRuns`, `pruneJournals`, and `reclaimSandbox`: the sweep that closes out a detached durable run.

  Detaching a run on disconnect (see the durable-agent-runs changeset) leaves `detachedSince` on the record and a journal on disk, but nothing acted on either — recovery was manual. This ships the sweep, built on `RunStore.listReclaimable`:
  - **`reapDetachedRuns(options)`** — one argument. It makes exactly **one** `listReclaimable({ now, ttlMs: 0 })` call and classifies expiry in-process against the same inclusive cutoff; listing twice with two TTLs would cost a second store round-trip to compute a subset of what the first call already returned. A run whose journal already reached its `{"__exit":N}` sentinel is driven to terminal so its transcript lands (outcome `'finalized'`); a run past `options.detachedRunTtlMs` is `requestRunCancel`'d and then driven (outcome `'expired'`, with the run's own `status` distinguishing a replay that reached `'completed'` from an agent cut off mid-sentence at `'aborted'`). It never drives a run purely to find out whether it finished — the injected, **required** `hasFinished` probe reads the journal out of band first, and `probeRunExit` is the shipped implementation.

    The remaining outcomes are not one bucket:
    - `'producing'` and `'unknown'` — **left completely alone**. The claim is never taken, so nothing appends, no terminal record is written, `close()` is not called, and `detachedSince` is untouched.
    - `'not-claimed'` — also left alone. Another host holds the claim (a real viewer attaching mid-sweep is exactly this), or the run reached terminal in another host's hands between the listing and the claim.
    - `'budget-exceeded'` — the **opposite** of left alone, and an anomaly worth investigating. `pipeToRunLog` is total, so the record **is** terminal, the log **is** closed, and `reclaim` fired. It is a diagnostic: a run the probe already said had finished failed to replay inside `runBudgetMs`, which means the journal read, the translation, or the log is misbehaving. Finalization-path only — an expired run that outran its budget reports `'expired'`, because there the budget firing is the designed stop.
    - `'reclaim-failed'` — the transcript **is** saved and the record **is** terminal; only `options.reclaim` threw, so the sandbox is still up. Not retryable by the sweep: a terminal record leaves `listReclaimable` for good, so this entry and its `error` are the only notice that the sandbox leaks. The shipped `sandboxReclaimer` **rejects** on its `'destroy-failed'` arm so this outcome is reachable without writing a custom `reclaim`. It overwrites `'budget-exceeded'` when a run hit both — the leak is what needs acting on — and `ReapRunEntry.terminalizedAnyway` is what keeps the budget anomaly on the entry: it is set if and only if that anomaly happened, independently of the outcome the reclaim later overwrote.
    - `'failed'` — something threw; it is logged, recorded, and the sweep continues with the rest of the batch.

  - **`pruneJournals(options)`** — one argument. It deletes a journal only once its run is provably terminal; every arm that is not a proven-safe deletion keeps, including a non-terminal `'interrupted'` run, an unknown `runId` (a journal legitimately exists before its record does, so those are kept until `orphanTtlMs`), a store lookup that threw, an undecodable filename, and an mtime age gate the sandbox's `find`/`stat` could not answer.
  - **`reclaimSandbox`** / **`sandboxReclaimer`** reclaim the sandbox recorded against a run once it's terminal, from `RunRecord.sandboxKey`. `reclaimSandbox` returns `'destroy-failed'` — not `'destroyed'` — when the provider's `destroy` throws. The instance record is deleted either way (a record pointing at nothing guarantees a failed `resume` on the thread's next turn), so an operator has to be able to tell "torn down" from "possibly still billing and no longer reachable from here"; `sandboxReclaimer` logs that one arm above debug level **and rejects with a `SandboxReclaimFailedError`** (also exported), because `ReapOptions.reclaim` is `(record) => Promise<void>` and a rejection is the sweep's only channel for "the sandbox was NOT reclaimed" — logging and resolving reported the run `'finalized'` and left `outcomes['reclaim-failed']` reading `0` on exactly the leak it watches for. Every other outcome resolves: they all mean there was nothing for the reclaimer to tear down. A mismatched provider touches nothing at all, record included.
  - All of the above, plus the journal listing and exit-probe helpers behind them, are exported from `@tanstack/ai-sandbox`'s root.

  **`ReapOptions.detachedRunTtlMs` is the ONLY detached-run TTL.** `withSandbox`'s `durability` option deliberately has no `detachedRunTtl`, and the capability payload (`SandboxRunDurability`) carries no `detachedRunTtlMs`. An earlier iteration of the unreleased durability seam accepted a duration string there, validated it at setup, and published the parsed value on the capability bus — where **nothing read it**. It could not be read: the only actor that enforces a TTL is `reapDetachedRuns`, which runs from a cron with no chat in flight, so it has no `CapabilityContext` and cannot reach that bus at all. Two knobs in two units at two call sites bought only silent divergence — `detachedRunTtl: '30m'` on `withSandbox` next to `detachedRunTtlMs: 5 * 60_000` on the sweep expired runs at five minutes while the configuration claimed thirty, and nothing warned. Configure the TTL once, in milliseconds, where it is actually enforced. Nothing is lost on the fail-loud front either: the reaper's option is a required `number`, so a `'30min'`-style typo is now a compile error rather than a runtime one. Neither the option nor `SandboxDurabilityOptions` itself has ever appeared in a published release, so no released API changes.

  **This ships a function, not a scheduler.** `reapDetachedRuns` does not run itself — the application must call it on its own cadence (a cron job, a Vercel Cron route, a Cloudflare Workers `alarm()`, a queue consumer). An app that wires `durability` and `runs` but never schedules the reaper has nothing closing out detached runs: tailers on a detached run park forever, `detachedRunTtlMs` is enforced by nothing, and a sandbox that should have been reclaimed keeps billing. Wiring durability and scheduling the reaper are two separate integration steps; only the second one closes the loop.

  This corrects `durable-agent-runs-takeover.md`'s claim that "the TTL reaper still reclaims a stuck detach" — that is only true once the application schedules `reapDetachedRuns`. Nothing reclaimed anything automatically before this changeset, and nothing does after it either, absent that wiring.

  Fix `useChat` aborting an in-flight delivery resume on mount. When `live` was
  not enabled, the mount effect called `client.unsubscribe()` unconditionally,
  which cancelled the shared in-flight stream — including the `joinRun` rejoin the
  client had just started for a reloaded run. The result was a mid-stream reload
  that caught up to the buffered point and then froze instead of continuing.
  `useChat` now only tears down a subscription it actually started, so a reload
  rejoins and streams the run through to completion.

  Resumable streams: reconnect to an in-flight SSE **or NDJSON** response without
  re-running the provider.

  `toServerSentEventsResponse` and `toHttpResponse` both accept a
  `durability: { adapter, batch }` option. The adapter (`StreamDurability`)
  records every chunk to an ordered log before delivery and tags each event with
  an opaque, adapter-owned offset — an SSE `id:` line, or the `id` of an NDJSON
  `{ id, chunk }` envelope (NDJSON has no native event-id). A reconnect
  (`Last-Event-ID`) or an explicit `?offset` read replays strictly after that
  offset from the log — the lazy provider stream is never iterated on resume.
  Producers terminalize the log on cancellation and failure (`RUN_ERROR` append
  - `close()`) and on completion when the source stream emits its own terminal
    event (`chat()` always does), so readers are never parked on a dead run.

  Two adapters ship: `memoryStream(request)` in `@tanstack/ai` (process-local,
  for development and tests) and the new `@tanstack/ai-durable-stream` package,
  a Durable Streams protocol adapter for production backends.

  For the `GET` handler that a reload or a second tab reconnects to,
  `resumeServerSentEventsResponse({ adapter })` and `resumeHttpResponse({ adapter })`
  replay a run straight from the durability log. They need no producer stream and
  return a 400 when the request carries no resume offset.

  On the client, all four HTTP adapters are now resumable — `fetchServerSentEvents`,
  `fetchHttpStream`, `xhrServerSentEvents`, and `xhrHttpStream`. Each tracks the
  per-event offset, auto-reconnects with `Last-Event-ID`, de-duplicates the
  replayed prefix, and exposes `joinRun(runId)` to attach to an in-flight or
  finished run from the start (read-only GET with `offset=-1`). Untagged streams
  behave exactly as before. A durable run that ends with no terminal event and no
  forward progress now throws `DurableStreamIncompleteError` instead of hanging.

  Reconnection and durability are bounded so failures surface rather than hang or
  loop:
  - `memoryStream` evicts completed logs after a grace window (unbounded growth
    is gone); resuming an expired/unknown run throws, and a from-start join to a
    run that never produces fails after `MemoryStreamOptions.firstChunkDeadlineMs`.
  - all four HTTP adapters accept `reconnect: { maxAttempts, delayMs }` — a
    throttle plus a ceiling on CONSECUTIVE no-progress reconnects (default 5;
    forward progress resets it) that fails with the new `StreamReconnectLimitError`
    instead of reconnecting endlessly, without penalizing a healthy long-lived run.
  - `durableStream` accepts `reconnect: { maxReadFailures, delayMs }` to bound its
    read-retry loop, and `server` is now optional when `fetch` is provided (e.g. a
    Cloudflare service binding).
  - `toServerSentEventsResponse` accepts `debug` to record durability terminal /
    close failures server-side, where a replaying joiner cannot observe them.

  A durable run is now joinable from the moment it is accepted, not from its first real chunk — closing the window where refreshing during a sandbox boot permanently orphaned a live run.
  - **`@tanstack/ai`**: a fresh durable producer appends (and forwards) a synthetic `CUSTOM` chunk named `RUN_ACCEPTED_EVENT` (`'run.accepted'`, exported) to the delivery log before the producer stream is first pulled. Pulling the stream is what runs the middleware chain, and middleware that boots a sandbox (create a container, install a CLI) can legitimately emit nothing for minutes; during that window the log was empty, so every joiner's empty-log fail-fast (`memoryStream`'s first-chunk deadline, the client's rejoin connect deadline) read the run as gone. Takeover alignment is unaffected: a journal replay cannot reproduce the marker, and alignment already skips stored `CUSTOM` chunks as out-of-band. Consumers that assert exact chunk sequences over a durable wire will see the marker first.
  - **`@tanstack/ai-client`**: a rejoin that times out before attaching now KEEPS the persisted resume pointer (the run may simply not have produced yet); only a join the server refuses with a hard error (unknown / evicted run) clears it. Previously one connect-deadline timeout cleared the pointer, so the next reload never retried.

  `isTerminalRunStatus` no longer reports a prototype-chain property as terminal, and `isRunStatus` ships so a backend can validate a stored row.

  `isTerminalRunStatus` tested `status in TERMINAL`, and `in` walks the prototype chain — so a store row whose `status` column held `'toString'`, `'constructor'`, or `'valueOf'` was reported **terminal**. `status` is typed `RunStatus`, but every value reaching the guard comes off a user-implemented `RunStore` (JSON out of D1, a Durable Object, Postgres) where nothing validated it, so the type was only a claim. A false `true` is destructive, not cosmetic: `@tanstack/ai-sandbox`'s journal sweep **deletes** a terminal run's journal — the only copy of the bytes a successor needs, with no undo — `attach-preflight` fails the attach as `'terminal-run'`, and core's resume driver refuses to drive the run.
  - `isTerminalRunStatus` now uses `Object.hasOwn(TERMINAL, status)`, keeping the `Record<TerminalRunStatus, true>` exhaustiveness trick that makes adding a terminal status a compile error.
  - **New: `isRunStatus(value: unknown): value is RunStatus`**, exported from `@tanstack/ai`, over the same exhaustiveness trick across the full union. Run it on a row's `status` at deserialization in your `RunStore` — the readers downstream act destructively on the answer. Core now does this at its own only store-status read (the resume driver), which refuses an unrecognized status and logs on the `errors` channel instead of coercing it.
  - `DetachableRunCapability` and `RunDetachedCapability` are `createCapability<true>()` rather than `<boolean>`. Absence is the documented negative for both, so a published `false` had no meaning yet was representable — and a consumer testing _presence_ rather than the value would have read one as the positive. Narrowing the payload makes that unrepresentable. A provider that published `false` (which meant nothing) stops compiling; publish nothing instead.

  `RunStore.findActiveRun` is now **required**. It was optional and
  feature-detected (`store.findActiveRun?.(threadId)`), which meant an adapter that
  had not implemented it was indistinguishable from one reporting "nothing is
  running": `reconstructChat` returned `activeRun: null`, and a client reloading
  mid-generation silently never reconnected to the run still producing. That is a
  production failure the type system was in a position to catch.

  Adapters that already implement `findActiveRun` need no change. Adapters that do
  not will now get a compile error; implement it as "most recent `'running'` run
  for the thread, `null` if none" — in SQL,
  `WHERE thread_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1`.
  A backend that genuinely has no run lifecycle should declare
  `ChatTranscriptStores` and omit `runs` entirely rather than stub the method.

  The store-contract evolution policy changes to match: new store methods are
  added as required, and capability tiers are expressed at the store level, not by
  optional methods. The conformance testkit no longer skips its `findActiveRun`
  assertions when the method is absent, and `findActiveRun` is no longer accepted
  in `skipMethods`.

  `RunStore` itself now lives in `@tanstack/ai`
  (`isTerminalRunStatus` / `defineRunStore` / `InMemoryRunStore` travel with it and
  are re-exported from `@tanstack/ai-persistence`), so the requirement applies
  there too. `@tanstack/ai-sandbox`'s `fenceRunStore` forwards `findActiveRun`
  unconditionally rather than materializing it only when the wrapped store has it;
  `listByThread` and `listReclaimable` are still forwarded only when present.

  fix(sandbox): a durable sandboxed run survives losing its viewer instead of being killed by it

  A client disconnect could only reach `withSandbox` if the application mirrored
  `request.signal` into `chat()`'s `abortController` — which aborts the run.
  `chat()` then returned at its cancellation check immediately after middleware
  `setup`, so the harness adapter's `chatStream` was never called and the agent in
  the sandbox that `setup` had just spent minutes building was **never launched**.
  Switching away while the UI still said "starting the sandbox" left an empty log
  for a run that did nothing — unrecoverable even by takeover, because an agent
  that never started writes no journal to replay. Applications had to choose
  between "the middleware learns about the disconnect" and "the run survives it".

  A disconnect is now delivered as a notification rather than a cancellation: the
  durable transport tells the run its response body was cancelled, without aborting
  it. `withSandbox` records `detachedSince`/`sandboxKey` and publishes the detach
  verdict, and the run keeps draining into its still-open delivery log for a
  rejoining client to tail. Teardown stays where it belongs — the file watcher is
  not stopped and the sandbox is not destroyed while the run is still using them.

  A genuine stop is unchanged: it arrives out of band (`RunRecord.cancelRequested`
  / `RUN_CANCEL_REASON`), and aborting an `abortController` you pass still
  terminalizes the run.

  A third thing was missing in that window, and core now owns it: the delivery log was
  empty, so every joiner's fast-fail (`memoryStream`'s first-chunk deadline, the
  client's 2s rejoin connect deadline) read a live run as gone. `RUN_ACCEPTED_EVENT`
  covers it for every durable run, so `withSandbox` deliberately appends no marker of
  its own — a second one would only land mid-stream in a run already producing.

  Two related fixes, both found while verifying the above:
  - `withSandbox` registered its run state only _after_ `definition.ensure()`, so a
    disconnect during the minutes-wide sandbox creation — the likeliest moment for
    one — was a silent no-op. State is now registered before `ensure`.
  - A durable run was invisible for the whole of `ensure`. Chat persistence creates
    the run record from `onConfig`, which runs after every middleware `setup`, so
    during the minutes a sandbox takes to build there was no record at all:
    `findActiveRun` reported nothing running for a run that was demonstrably
    starting (measured: a status sidebar showed `idle` for 6.5 minutes), a client
    returning to the thread had nothing to tell it a run was in flight and rendered
    an empty pane, a crash in that window left nothing for `listReclaimable` to
    surface, and the detach stamp silently no-opped because `RunStore.update` does
    nothing for an unknown runId. `withSandbox.setup` now pre-creates the record
    before `ensure` for durable runs only; `createOrResume` is idempotent, so
    persistence's own later call simply finds it.

  `withSandbox` also records the harness's own tool calls into the transcript, so a
  FINISHED run restores its tool cards instead of only its verdict. A harness executes
  its tools inside the sandbox, so `chat()` merely relays their `TOOL_CALL_*` chunks —
  it never wrote an assistant message for them, and chat persistence stores
  `ctx.messages`. The tool history therefore existed only in the run's delivery log:
  switching away and coming back replayed all of it (there was a live run to rejoin),
  while a reload after the run finished hydrated from the message store and got the
  prompt plus the final text and nothing else (measured: 487,443 characters of
  transcript before the reload, 4,014 after). They are recorded as ordinary `toolCalls`
  plus `role: 'tool'` messages, which needs no new wire format and no client change —
  `modelMessagesToUIMessages` already merges a stored result into the call it belongs to
  and completes the card.

  Each recorded call carries `metadata.sandboxObserved`, which does two jobs. It is
  stripped from the request to the model on the next turn — those calls name tools the
  provider was never given, and one run of them is far too many tokens to replay — and
  it lets an app's own `MessageStore` find them in `saveThread` to cap or drop what it
  does not want to keep. Nothing is truncated for you; results are handed over whole.
  See `docs/sandbox/events.md`.

  One public addition, `isSandboxToolCall(toolCall)` from `@tanstack/ai-sandbox`: true
  when a tool call was executed by the harness inside the sandbox and recorded for
  display. It reads the marker so an app never has to know the metadata key, and it also
  accepts a rendered `tool-call` part, whose `metadata` is copied from the message — so
  the same helper filters a client-side view. Everything else is internal: the disconnect
  seam is exposed only through `@tanstack/ai/adapter-internals` for
  `@tanstack/ai-sandbox`, and the recorder itself is private to `withSandbox`.

  Durable **sandbox instance** resume for multi-process / multi-replica deploy.
  - **`SandboxInstanceStore` / `SandboxInstanceRecord` / `InMemorySandboxInstanceStore` / `SandboxInstanceStoreCapability`** in `@tanstack/ai-sandbox`
  - **`withSandbox(sandbox, { instances, locks? })`** takes the store directly, so it cannot be mis-ordered (in-memory fallback when absent). `SandboxInstanceStoreCapability` + `provideSandboxInstanceStore` remain for ambient/platform wiring; an explicit option wins over the bus.
  - **`defineSandboxInstanceStore`** for inline BYO typing (same pattern as `defineLock` / `defineMessageStore`)
  - Pair multi-instance with **`withLocks`** from `@tanstack/ai/locks` (distributed lock)
  - Independent of chat persistence — compose both when the app needs transcript durability _and_ instance reuse
  - Conformance: `runSandboxInstanceStoreConformance` from `@tanstack/ai-sandbox/testkit`

  `SandboxCapabilities.killableProcesses` is now either measured or falsifiable on every bundled remote provider, instead of asserted in a comment.

  The flag is not cosmetic: `journalReadStrategy` reads it to pick `'follow'` (a spawned `tail -c +N -f`) over `'poll'` (bounded `exec` reads). A wrong `true` starts a process the host then cannot stop, leaking one per run. Two providers were recently probed and **both** declared it falsely, so the remaining declarations were audited rather than trusted.
  - **Vercel** — `killableProcesses` is now `false`. Its `kill()` only called `controller.abort()`, and that signal reaches nothing: `@vercel/sandbox` forwards a detached command's `signal` to the HTTP request that _starts_ the command (already resolved by the time the handle exists) and to a log pipe this handle does not use. `kill()` was a no-op that left the remote process running — the same client-side-detach shape as the Docker defect. `kill()` now issues the SDK's real server-side `Command.kill('SIGKILL')` (and the caller's `signal` routes through the same path, best-effort so teardown cannot throw), but whether that reaches the forked `tail -f` is unmeasured, so the capability stays `false` and reads poll.
  - **Daytona** — `killableProcesses` is now `false`. `kill()` aborts the client-side poll loop and resolves _before_ anything attempts termination; the `deleteSession` that was supposed to be the kill runs later from the pump's teardown, swallows its own failures, and is documented as cleanup for a _completed_ session.
  - **Sprites** — left `true`, because its `kill()` is a genuine server-side `POST /exec/<sessionId>/kill` rather than a stream detach — but the declaration is now labelled unverified: what that endpoint signals (process group or pid) is undocumented, and the follow command is a multi-statement shell whose `tail -f` is necessarily a child.
  - **Cloudflare** — `false` confirmed by behavior, not by reading the constant: a test drives a still-running command, calls `kill()`, and asserts nothing was cancelled and no `AbortSignal` ever reached `exec` (Workers RPC cannot serialize one), then that `journalReadStrategy` answers `'poll'`.

  Daytona, Vercel, and Sprites each register the shared journal conformance suite. With credentials present it measures the claim against a real sandbox; without them it reports a **named skip** carrying the reason, never a silent pass.

  Separately, `@tanstack/ai-sandbox-cloudflare`'s `pipeToRunLog` now honors its documented "never rejects" contract. `log.open`, the terminal `log.finish`, the recovery `append`/`finish`, and the final record re-read were all unguarded, and `RunController.start` consumes the promise fire-and-forget — so any of them rejecting was an unhandled rejection, which is **instance-fatal inside a Durable Object**. Every call is now individually guarded and reports through an optional `logger`, a failing re-read falls back to a locally rebuilt terminal record instead of throwing, and the fire-and-forget hand-offs use two-argument `then` rather than `.finally` (which adopts rejections).

  Make a mid-stream reload resume the same conversation cleanly.
  - `withPersistence` now persists the pending turn at the start of a run (so a
    reload during generation still shows the user's message), stamps each
    assistant turn with its stream `messageId`, and accepts
    `withPersistence(persistence, { snapshotStreaming: true })` to also persist the
    in-progress reply on a throttled interval (`snapshotIntervalMs`, default
    `1000`) for partial-output durability.
  - `ModelMessage` gains an optional `id`; `modelMessagesToUIMessages` preserves
    it, so a hydrated message keeps the same identity as its live stream.
  - On reload, the chat client rebuilds an in-flight assistant turn from the
    delivery log (replaying from the start and applying the buffered backlog in one
    batch) instead of reconciling against the persisted partial, so the reload
    shows one clean bubble that catches up and continues rather than a frozen or
    duplicated partial.

  Make generation persistence work with server functions and direct connections. Server-driven restore (`persistence: true`) previously only worked with the HTTP adapters (`fetchServerSentEvents` / `fetchHttpStream` and their XHR variants), because they are the only connections that implement the optional `hydrateGeneration(threadId)` and `joinRun(runId)` handlers; with `stream()`, `rpcStream()`, or a plain `fetcher` the option silently no-opped, and a stored snapshot still `running` after a reload left the hook stuck on `generating` forever.

  **Handlers on the lightweight adapters (`@tanstack/ai-client`).** `stream()` and `rpcStream()` take an optional second argument, `StreamConnectionHandlers` (`{ hydrate, hydrateGeneration, joinRun }`), spread onto the returned adapter so server-driven persistence works without an HTTP endpoint — each handler is typically a one-line server-function or RPC call. `ConnectConnectionAdapter` also declares the optional chat `hydrate` handler alongside the generation ones.

  **Handlers as generation options (`@tanstack/ai-client`).** `GenerationClientOptions` (and `VideoGenerationClientOptions`, plus every framework hook's generation options) accept optional `hydrateGeneration` / `joinRun` alongside a `fetcher` — or as a fallback when a connection doesn't carry its own. `persistence: true` now hydrates whenever either source exists; the constructor warning only fires when neither does.

  **Interrupted runs no longer stick on `generating` (`@tanstack/ai-client`).** A restored or hydrated snapshot with `status: 'running'` that no `joinRun` handler can tail is repainted as an interrupted error — an interrupted generation cannot be resumed, only re-run — in both `GenerationClient` and `VideoGenerationClient`.

  **Request-free hydration (`@tanstack/ai-persistence`).** New `getGenerationHydration(persistence, id, { by?: 'threadId' | 'runId' })` returns the plain `{ resumeSnapshot, activeRun }` payload straight from the `generationRuns` store, so a server function can back `hydrateGeneration` without fabricating a `Request`. `reconstructGeneration` now delegates to it; `authorize` stays on the `Request`-based function only, so server-function callers gate on their own session before resolving the id.

  **Server-function run replay (`@tanstack/ai`).** `memoryStream` also accepts an explicit `{ runId, offset? }` init instead of a `Request`, and a new `replayRunStream(durability, offset?)` async generator maps a durability `read` (from the start by default) to a bare `StreamChunk` stream — together they let a streaming server function serve `joinRun` for a run id it received as call data.

  **Add a shared `Scope` identity type to `@tanstack/ai`.**

  `Scope` is the single identity/isolation vocabulary for the subsystems that
  persist or recall per-conversation data — `@tanstack/ai-persistence` and
  `@tanstack/ai-memory`. Rather than each subsystem inventing its own notion of
  "whose data is this?", both import one type:

  ```ts
  interface Scope {
    threadId: string // required — the single conversation key (same as ctx.threadId)
    userId?: string // durable end-user identity; required in practice for multi-user apps
    tenantId?: string // multi-tenant boundary
    namespace?: string // reserved logical partition; no subsystem keys on it yet
  }
  ```

  `threadId` is the one conversation key across the codebase (matching
  `ChatMiddlewareContext.threadId`, with `conversationId` already deprecated in
  favor of it) — subsystems must not introduce a second name (`sessionId`, …) for
  the same concept. Every field is an isolation boundary and must be derived
  server-side from trusted session state, never from client input.

  Introduced ahead of the persistence and memory packages so both share one settled
  identity contract. `@tanstack/ai-memory` now aliases `MemoryScope` to `Scope`
  (see the memory-scope-threadid changeset).

  **Make every bundled Agent Skill discoverable by TanStack Intent.**

  Intent finds skills by scanning `node_modules` for packages that carry the
  `tanstack-intent` keyword, and can only load what npm actually publishes. Three
  packages shipped skills that failed one half of that contract:
  - `@tanstack/ai-mcp` wrote its skill into a `skills/` directory that was missing
    from `files`, so it was never published at all.
  - `@tanstack/ai-memory` and `@tanstack/ai-sandbox` published their skills but
    lacked the keyword, so Intent never looked at them.

  All three now publish `skills` and carry the keyword, matching `@tanstack/ai`,
  `@tanstack/ai-code-mode`, and `@tanstack/ai-persistence`.

  The client persistence skill also moves from `@tanstack/ai-persistence` to
  `@tanstack/ai` as `ai-core/client-persistence`. It teaches
  `localStoragePersistence` / `sessionStoragePersistence` / `indexedDBPersistence`
  and the `persistence` option on `useChat` — all of which live in the framework
  packages, not in `@tanstack/ai-persistence`. An app doing browser-only
  persistence never installs that package, so the guidance was unreachable for
  exactly the people who needed it, and `ai-core` routed to a path that did not
  exist on disk. Skills now follow the code that owns them.

  Make streaming `summarize()` resumable across a mid-run reload, like the media
  activities. Additive, no public API change beyond two optional fields:
  - `summarize()` (and `SummarizationOptions`) accept optional `runId` / `threadId`.
    When set on a streaming summarize, they are threaded into the wrapped chat so
    the emitted `RUN_STARTED` carries the caller's `runId` — letting a
    delivery-durable route key the run's log by the same id the client rejoins
    with, so a mount-time `joinRun` tails the run to completion instead of
    fast-failing on a mismatched (empty) log.
  - `@tanstack/openai-base`'s Responses `chatStream` now honors
    `options.runId` for the AG-UI `RUN_STARTED` (mirroring how it already honors
    `options.threadId`), falling back to a generated id when unset.

  Update model metadata from OpenRouter API

  **Breaking:** trim the persistence public API down to what an app actually calls.

  Generation persistence is server-driven, so the types and options that only
  existed to support a client-managed copy of a run are gone.
  - **`initialResumeSnapshot` is removed from every generation hook** (`useGeneration`,
    `useGenerateImage`, `useGenerateVideo`, `useGenerateAudio`, `useGenerateSpeech`,
    `useSummarize`, `useTranscription`, and the Solid / Vue / Svelte / Angular
    equivalents) and from `GenerationClient` / `VideoGenerationClient`. A run is
    restored by `persistence: true` plus a `hydrateGeneration` handler. **`useChat`
    keeps its `initialResumeSnapshot`.**
  - **No longer exported from `@tanstack/ai-client`** (they are internals of the
    hydration path): `GenerationResumeSnapshot`, `GenerationResumeState`,
    `GenerationResumeStatus`, `GenerationResultSnapshot`, `GenerationErrorSnapshot`,
    `GenerationEventSnapshot`, `GenerationPendingArtifact`,
    `parseGenerationResumeSnapshot`, `updateGenerationResumeSnapshot`, and
    `ChatResumeSnapshot`. `GenerationPersistenceOption` (an alias for `boolean`) is
    deleted; write `persistence?: boolean`. `GenerationPersistenceOptions`, the
    union that requires a `threadId` alongside `persistence`, is unchanged.
  - **`ChatResumeSnapshotV1` / `ChatResumeSnapshotV2` are collapsed into one shape**
    with no `schemaVersion` field. The two versions were structurally identical, no
    reader branched on the version, and only V2 was ever written.
  - **The framework packages no longer re-export `PersistedArtifactRef`.** No hook
    type refers to it; import it from `@tanstack/ai` where the artifact stores are
    defined.
  - **`artifactBlobKey` is no longer exported from `@tanstack/ai-persistence`.** Use
    `resolveArtifactBlobKey(record)`, which its own docs already recommended for
    reads, since a record written with a custom `storageKey` carries its real key.
  - **`createInterruptController` and `InterruptController` are deleted.** The
    controller only forwarded five calls to the `interrupts` store; call the store
    directly (`persistence.stores.interrupts`).
  - The ctx-capability plumbing (`PersistenceCapability`, `InterruptsCapability`,
    `getPersistence`, `providePersistence`, `getInterrupts`, `provideInterrupts`) is
    unchanged and now documented, for middleware that reads the stores
    `withPersistence` holds. See
    [Persistence internals](https://tanstack.com/ai/latest/docs/persistence/internals).

  The chat hooks no longer take an `id` option — a hook's identity is its `threadId`.

  `useChat` / `createChat` previously accepted a separate `id` that keyed client
  persistence and named the devtools instance, defaulting to a framework
  `useId()` when omitted. That meant persistence keyed on an ephemeral render-tree
  id even when you passed a stable `threadId`, so a reload found nothing under the
  thread's key.

  Now the `threadId` is the single identity:
  - The hooks drop the `id` option. Pass `threadId` to persist a conversation and
    restore it on reload; omit it for an ephemeral chat.
  - Persistence keys on `threadId` (unchanged in `ChatClient`, which already
    resolved `id ?? threadId` — the hooks simply stop overriding it).
  - `ChatClient.uniqueId` (the devtools instance id) now falls back to `threadId`
    instead of a generated id, so a thread shows up in devtools under its own id.
  - Changing `threadId` on a mounted `useChat` (react/preact/solid) now recreates
    the client so the new thread takes effect; previously the change was ignored.

  `ChatClient` still accepts `id` directly as a lower-level escape hatch for
  keying storage separately from the wire thread; only the framework hooks drop it.

  Migration: replace `useChat({ id })` with `useChat({ threadId })`.

### Patch Changes

- Updated dependencies [[`7499171`](https://github.com/TanStack/ai/commit/74991716aea4d90a5d0363676a1e3349689a48e8)]:
  - @tanstack/ai@0.43.0
  - @tanstack/ai-utils@0.4.0
