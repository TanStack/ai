# @tanstack/ai-compaction

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

- Updated dependencies [[`fcbd199`](https://github.com/TanStack/ai/commit/fcbd199a66b553acef0b81bc76c4b4acd7fde6a9), [`959f43e`](https://github.com/TanStack/ai/commit/959f43e4b11112f2c097f642bdec34d8d0f83e27), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`fa2a291`](https://github.com/TanStack/ai/commit/fa2a291f5526f6dec9a91fe5b71de15dfaf59ec7), [`f7e7cce`](https://github.com/TanStack/ai/commit/f7e7cce8f2d543a7480b626b7985417e054bfd8d), [`7a0a48b`](https://github.com/TanStack/ai/commit/7a0a48bac8b531a90e768c87cb645da2fc8d3f31), [`468063c`](https://github.com/TanStack/ai/commit/468063c07cd904be97b154b415163c23510834b2), [`fe83aa0`](https://github.com/TanStack/ai/commit/fe83aa05fe2346c50693664d4a4896d4fc1fea5a), [`781a3a8`](https://github.com/TanStack/ai/commit/781a3a82c870e246deff23c7aca32094e9aaaf2f), [`39abb7e`](https://github.com/TanStack/ai/commit/39abb7ed172b4357bc04a39fc6cf7c3577f77cf3), [`f1b3f65`](https://github.com/TanStack/ai/commit/f1b3f65a59fb75116bd52abbb162cab8c763d10e)]:
  - @tanstack/ai@1.0.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`824ee98`](https://github.com/TanStack/ai/commit/824ee98060983dd2b5728f288cecefa6a1250325)]:
  - @tanstack/ai@0.71.0

## 0.3.0

### Minor Changes

- [#1728](https://github.com/TanStack/ai/pull/1728) [`3292bad`](https://github.com/TanStack/ai/commit/3292bad7b26990c5aa4676cc9d9fe33b1741fc1a) - Prepare a compaction summary in the background with `withCompaction({ background: { atTokens } })`.
  - When the count at a model call is over `atTokens` and not over `maxTokens`, the strategy runs on a copy of the messages. The model call does not wait for it.
  - The result waits in the metadata store (namespace `@tanstack/ai-compaction:background`), or in memory without one. It applies at the first model call of the next run: as a `tanstack.compaction` record on a durable host, or as the checkpoint.
  - A model call over `maxTokens` while the summary runs waits for it and applies it. It compacts inline only when the list is still over `maxTokens`.
  - A result whose kept message is gone, because a newer compaction cut further, is dropped. `compaction:ended` and `onCompact` report it with `stale: true`. A failed summary is reported with `error` and applies nothing.
  - `CompactionReason` has a new value, `'background'`. Setup throws when `atTokens` is not below `maxTokens`.

- [#1728](https://github.com/TanStack/ai/pull/1728) [`3292bad`](https://github.com/TanStack/ai/commit/3292bad7b26990c5aa4676cc9d9fe33b1741fc1a) - Count with real usage, compact on demand, and keep compaction in a session log.
  - `countTokens: 'usage'` counts with the usage the provider reported for the last call, plus an estimate of the newer messages.
  - When a model call fails with `CONTEXT_OVERFLOW_CODE`, `withCompaction` compacts and calls the model again in the same run, once per model call.
  - `compactNext(threadId)` compacts at the next model call. `auto: false` turns off compaction at `maxTokens` and keeps `compactNext`, the overflow retry, and the overflow check.
  - `durable: true` writes a `tanstack.compaction` record through `LogRecordsCapability` when the host provides it. Fold the record into the messages with `projectCompaction`.
  - With `countTokens: 'usage'` and `durable: true`, a run checks once more after its last model call. When the usage passed `maxTokens` or `contextWindow`, compaction runs right away. `contextWindow` also counts with `auto: false`.
  - `compaction:ended` and `onCompact` report `reason`, the summary `usage`, and an `error`. `continueOnError` sends the full messages when the strategy fails.
  - `summarizeOldest({ cut: 'turn' })` gives the start of a cut turn its own summary. `conversationSummarizer` writes a structured summary, updates the older summary, and takes a `details` hook. The summary message is now wrapped in an `<untrusted-conversation-summary>` tag, so a later compaction can find and update it.

### Patch Changes

- [#1787](https://github.com/TanStack/ai/pull/1787) [`ee374b4`](https://github.com/TanStack/ai/commit/ee374b4753adfc2ae305edad03f1ac9a588321fa) - A failed native `compact` is not saved as the checkpoint or the durable compaction record. The next process calls `compact` again. A compact result keeps image files, documents, and audio, and sends those parts back on the next request.

- Updated dependencies [[`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555), [`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555), [`5f95dbd`](https://github.com/TanStack/ai/commit/5f95dbd08f2780442000ac52074ea747d1b44187), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b), [`3292bad`](https://github.com/TanStack/ai/commit/3292bad7b26990c5aa4676cc9d9fe33b1741fc1a), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b), [`4298480`](https://github.com/TanStack/ai/commit/429848047c8c514f29855f8a99a7260253eb5d5b), [`f68da51`](https://github.com/TanStack/ai/commit/f68da51f63f999b70ac7aaf5aebc0109a7e9daf7), [`30fa651`](https://github.com/TanStack/ai/commit/30fa651d173e519db8de50c9f888ded71b951640), [`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b)]:
  - @tanstack/ai@0.70.0

## 0.2.0

### Minor Changes

- [#1729](https://github.com/TanStack/ai/pull/1729) [`51f72fb`](https://github.com/TanStack/ai/commit/51f72fbf60e201f9c8d014aefa6406e777c05d6a) - A text adapter can now have an optional `compact(options)` method. It sends the history to the provider's own compaction endpoint, and resolves to the history for the next calls. The options are `TextCompactOptions`: `messages`, `model`, `signal`, `wrapFetch`, and `systemPrompts`.

  The OpenAI Responses adapters implement `compact` with `POST /responses/compact`. The request sends the system prompts as `instructions`. It sends no tools, because the endpoint does not take them. The encrypted `compaction` item goes back to the same model as it is on later requests. A compact result with no compaction item throws.

  `withCompaction` has a new `native` option. Pass the adapter of the `chat()` call. When the adapter has `compact`, it runs in place of `strategy`. When `compact` fails, `strategy` runs, and `onCompact` and `compaction:ended` get the failure in `error`. After a 404, 405, or 501, that adapter and model use the strategy for the rest of the process. After any other failure, the next compaction tries `compact` again. Without the option, nothing changes.

### Patch Changes

- Updated dependencies [[`1bfcee3`](https://github.com/TanStack/ai/commit/1bfcee35bb3cf0ff3aac005440c842e66c3d687d), [`412b0fe`](https://github.com/TanStack/ai/commit/412b0fea4f4bb569998c3d253d174efd7b501e3c), [`a0150c2`](https://github.com/TanStack/ai/commit/a0150c26b9e2b6050663450171e36a9dfa80915b), [`b881627`](https://github.com/TanStack/ai/commit/b881627d51076dcc1af031ac951046e2fb7d84c4), [`fac0555`](https://github.com/TanStack/ai/commit/fac055559de98eb0fa23a0bc725808033ba3c2fc), [`6774e80`](https://github.com/TanStack/ai/commit/6774e803da3205101613ab2857c9ed4fbf975681), [`5bd27f2`](https://github.com/TanStack/ai/commit/5bd27f2fc94ebfb6d11bfb28d46d5d858310805e), [`c20f7b0`](https://github.com/TanStack/ai/commit/c20f7b021aa618fbfcc114b3f0bef5e888ff6b84), [`cef1911`](https://github.com/TanStack/ai/commit/cef19119c76fc5f618d6c971efbc486323b213c3), [`51f72fb`](https://github.com/TanStack/ai/commit/51f72fbf60e201f9c8d014aefa6406e777c05d6a), [`6f1e559`](https://github.com/TanStack/ai/commit/6f1e55934fe95ddf2bf3fb3031488a713e48c7af), [`cef1911`](https://github.com/TanStack/ai/commit/cef19119c76fc5f618d6c971efbc486323b213c3), [`7532b2b`](https://github.com/TanStack/ai/commit/7532b2b09188ebd1095a60a7c5df6ef08b06916c), [`1bfcee3`](https://github.com/TanStack/ai/commit/1bfcee35bb3cf0ff3aac005440c842e66c3d687d), [`78edeb2`](https://github.com/TanStack/ai/commit/78edeb20a5ba89f2513c3f46f1267a7ed7185045), [`44e3a0a`](https://github.com/TanStack/ai/commit/44e3a0a89c86defebd38b2221dd3b7725a12839a), [`7532b2b`](https://github.com/TanStack/ai/commit/7532b2b09188ebd1095a60a7c5df6ef08b06916c), [`7a5c0d6`](https://github.com/TanStack/ai/commit/7a5c0d6fc1541187a7f01b444bc07a0478274bcb), [`b881627`](https://github.com/TanStack/ai/commit/b881627d51076dcc1af031ac951046e2fb7d84c4)]:
  - @tanstack/ai@0.69.0

## 0.1.17

### Patch Changes

- Updated dependencies [[`723b4a4`](https://github.com/TanStack/ai/commit/723b4a4e8432825374d4980cc74c5f66dc7d1122), [`d84a49e`](https://github.com/TanStack/ai/commit/d84a49e5fef03499b10f63255880d056a55767a3)]:
  - @tanstack/ai@0.68.0

## 0.1.16

### Patch Changes

- Updated dependencies [[`7dbfaf6`](https://github.com/TanStack/ai/commit/7dbfaf6c37a3d97de3b1f5bdb87be8bbbe2b0164), [`88fd67c`](https://github.com/TanStack/ai/commit/88fd67cd7ddfbe2b154173d2395b2c0338e97644), [`3aa2e3d`](https://github.com/TanStack/ai/commit/3aa2e3d95e2dcb1c14b4fda3bcdbdf3152582092), [`c5ae415`](https://github.com/TanStack/ai/commit/c5ae4152d0a040bb6ce7321e16b7ee66d3c36f96), [`13ba1b0`](https://github.com/TanStack/ai/commit/13ba1b0e47dc822f10f6c5133184f92c2eb0a013), [`377262c`](https://github.com/TanStack/ai/commit/377262c0b4e5f59f8fd467a831b9341cc705077e)]:
  - @tanstack/ai@0.67.0

## 0.1.15

### Patch Changes

- [#1671](https://github.com/TanStack/ai/pull/1671) [`2ee30cf`](https://github.com/TanStack/ai/commit/2ee30cf4768033cc66d65d4aa1251fd2d6fa6e1f) - `summarizeOldest` now fails the compaction when the summarizer returns an empty or whitespace-only summary. Before, it replaced the old messages with an empty summary and saved that result in the checkpoint, so the history was lost. Now the strategy throws an error, the history stays, and no checkpoint is written.

- Updated dependencies [[`baafb17`](https://github.com/TanStack/ai/commit/baafb176220c2b09fced334ad176e754582cd314)]:
  - @tanstack/ai@0.66.1

## 0.1.14

### Patch Changes

- Updated dependencies [[`f687c54`](https://github.com/TanStack/ai/commit/f687c54ae4b8a67f2154ff9dea0319b8d2712856), [`fb55bcb`](https://github.com/TanStack/ai/commit/fb55bcba5193d4465f43006505918a2dc4472ec4), [`630ec86`](https://github.com/TanStack/ai/commit/630ec86e9997fabe046cae1a491060d72cbc71ea)]:
  - @tanstack/ai@0.66.0

## 0.1.13

### Patch Changes

- Updated dependencies [[`7b6b1a9`](https://github.com/TanStack/ai/commit/7b6b1a99d45e40165f0a1f833a04e793a09275de), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`82291b2`](https://github.com/TanStack/ai/commit/82291b22941d2c813ff0050fc9d41b024480153d), [`ff3a66e`](https://github.com/TanStack/ai/commit/ff3a66ed8f628d45b282316fab337d3ed19f34cd), [`560c76f`](https://github.com/TanStack/ai/commit/560c76fd638b5691e195e1d0619fee8a78d98c20), [`4b9dcb4`](https://github.com/TanStack/ai/commit/4b9dcb44d8fe1e7c933b79c23d8f072e7bc300f4), [`30254ad`](https://github.com/TanStack/ai/commit/30254ad70161894d232d3b45e3b21f45d49f336e), [`40fdd22`](https://github.com/TanStack/ai/commit/40fdd22ce05d55e71514b4cc80b1c28cefb4a431)]:
  - @tanstack/ai@0.65.0

## 0.1.12

### Patch Changes

- Updated dependencies [[`3a09cf0`](https://github.com/TanStack/ai/commit/3a09cf04431a45810051ea5df6bb3935af421ddb), [`ee726f5`](https://github.com/TanStack/ai/commit/ee726f537dbb036d5edb756b92739afaa7573824), [`a5fce7f`](https://github.com/TanStack/ai/commit/a5fce7f95b8b9c6eb57697aa1e3f587bf27483b9), [`94116ad`](https://github.com/TanStack/ai/commit/94116ad137015b6f62fe62b4c06a335dbde36a49)]:
  - @tanstack/ai@0.64.0

## 0.1.11

### Patch Changes

- Updated dependencies [[`37b2826`](https://github.com/TanStack/ai/commit/37b282655ea9c780e9793ef33013d64b1bf88625), [`8e8ee26`](https://github.com/TanStack/ai/commit/8e8ee26959a471bb6fac180ded3a9a048ae93609), [`c5c1996`](https://github.com/TanStack/ai/commit/c5c19961b8c98497fd88ae93c5d6330d7b2ecb6a), [`3e30cde`](https://github.com/TanStack/ai/commit/3e30cde8ae7f5be7be3bc9c4f30c842159fc7edf), [`0eb8f0b`](https://github.com/TanStack/ai/commit/0eb8f0b7f4ffa0133a814f8fcfccbc1acedd7488), [`f44b6b2`](https://github.com/TanStack/ai/commit/f44b6b22578b893501e05612f02ea1aaee0951d3), [`d632d41`](https://github.com/TanStack/ai/commit/d632d41df227bf11bc3cdbf5542823f87562b3d4)]:
  - @tanstack/ai@0.63.0

## 0.1.10

### Patch Changes

- Updated dependencies [[`a450d00`](https://github.com/TanStack/ai/commit/a450d007a039610994342dd9c3387f880a4eb992), [`c54e20c`](https://github.com/TanStack/ai/commit/c54e20cf5be8e1f73e0be661e242391fa0e4633e), [`a56192e`](https://github.com/TanStack/ai/commit/a56192eafa0da2ccca2d576dc4371b196355c605), [`740ae66`](https://github.com/TanStack/ai/commit/740ae6664d358f00deddf72319ef947fe3bb0935), [`5099a32`](https://github.com/TanStack/ai/commit/5099a32cbfb6c77e335769793415fe7e90bb17d8), [`820429f`](https://github.com/TanStack/ai/commit/820429fa9bea8ba220cf073406760475ac07b112), [`0abae97`](https://github.com/TanStack/ai/commit/0abae97f94fe4d37523f8a6427972ae7fe3b7fde), [`8c68c2d`](https://github.com/TanStack/ai/commit/8c68c2d9750bcc818201089bbbb7d90aa26d99a1)]:
  - @tanstack/ai@0.62.0

## 0.1.9

### Patch Changes

- Updated dependencies [[`54d39d3`](https://github.com/TanStack/ai/commit/54d39d30704bbdbdccea756af31530cc6713fc2e), [`2d047c5`](https://github.com/TanStack/ai/commit/2d047c5cf5f25c244c05f0cb0e816b9634616fbb), [`74b5823`](https://github.com/TanStack/ai/commit/74b582305471eaf37a3b68595e60ed1a6f42d914), [`abb0169`](https://github.com/TanStack/ai/commit/abb0169bf96c38f59791450ce060d089a7fcd26e), [`ed87986`](https://github.com/TanStack/ai/commit/ed87986069bcfe42a51cedf1365cc10662b0e088), [`a0f7c14`](https://github.com/TanStack/ai/commit/a0f7c14a9d9a4b2e72e87b976f46d193deb5921b)]:
  - @tanstack/ai@0.61.0

## 0.1.8

### Patch Changes

- Updated dependencies [[`ef0a00f`](https://github.com/TanStack/ai/commit/ef0a00f09059abfd9e96eb1367e8ff0280458abd)]:
  - @tanstack/ai@0.60.0

## 0.1.7

### Patch Changes

- Updated dependencies [[`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0)]:
  - @tanstack/ai@0.59.0

## 0.1.6

### Patch Changes

- Updated dependencies [[`796f2b5`](https://github.com/TanStack/ai/commit/796f2b5f7c05debe251ad3ecd4073d8cd119b3db)]:
  - @tanstack/ai@0.58.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`04bfd8c`](https://github.com/TanStack/ai/commit/04bfd8c26ce337cca53f3f8d286f14ed0432a329), [`254ab5f`](https://github.com/TanStack/ai/commit/254ab5ff5b0a9ca945cb313588f4b56394c7ecf7)]:
  - @tanstack/ai@0.57.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`7c4b25e`](https://github.com/TanStack/ai/commit/7c4b25ebefc64e4f209c282788f515939eca02e9), [`f60f736`](https://github.com/TanStack/ai/commit/f60f73612dd7621e2f1ad76abb1a640307dea3c6)]:
  - @tanstack/ai@0.56.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`fa13446`](https://github.com/TanStack/ai/commit/fa13446fab9b9048de9433a5ebf55bc626f5fd74), [`0945a79`](https://github.com/TanStack/ai/commit/0945a79b0923b31a5122d0bf28c115879341a410)]:
  - @tanstack/ai@0.55.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`c17bc95`](https://github.com/TanStack/ai/commit/c17bc951ca783d8023bf54d69035c19c0c72ea2f), [`53e2ec0`](https://github.com/TanStack/ai/commit/53e2ec082b40d8c3fcd09f408c29f0b895436198), [`6269eff`](https://github.com/TanStack/ai/commit/6269eff90e770205ffd9cae8c5989b8ff02b57ce)]:
  - @tanstack/ai@0.54.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`21775ee`](https://github.com/TanStack/ai/commit/21775ee2d23dd594cdc184678ff587341bd74871)]:
  - @tanstack/ai@0.53.0

## 0.1.0

### Minor Changes

- [#1235](https://github.com/TanStack/ai/pull/1235) [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7) - Add `@tanstack/ai-compaction` — context-window compaction as a `chat()`
  middleware. `withCompaction({ maxTokens, strategy })` runs a pluggable
  `CompactionStrategy` before each model call, so compaction is incremental and
  rolling. Three strategies ship built in: `evictOldest` (drop old messages, the
  default), `summarizeOldest` (replace them with an LLM summary), and
  `clearToolResults` (stub old tool output, keep the messages). Combine them with
  `composeStrategies`, which escalates through strategies until the transcript is
  back under budget. Strategies preserve tool-call/result pairing and never touch
  the system prompt.

- [#1235](https://github.com/TanStack/ai/pull/1235) [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7) - Show compaction in TanStack AI DevTools. `withCompaction` injects
  `compaction:started`, `compaction:state`, and `compaction:ended` CUSTOM
  stream events. State includes before/after counts, the token budget, and
  dropped vs sent message previews. The chat client re-emits the same three
  events. The AI panel has a Compaction tab and started/state/ended steps on
  the iteration.

- [#1235](https://github.com/TanStack/ai/pull/1235) [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7) - Keep canonical chat history separate from compacted provider context. Reuse
  validated compaction checkpoints through an optional persistence metadata store.

### Patch Changes

- [#1235](https://github.com/TanStack/ai/pull/1235) [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7) - Add `ctx.emitCustomEvent` on chat middleware context. The engine yields
  `CUSTOM` chunks while hooks such as `onConfig` are still running, so a long
  middleware step can send progress before it finishes. Compaction uses this
  to emit `compaction:started` before the strategy returns.
- Updated dependencies [[`49fc54c`](https://github.com/TanStack/ai/commit/49fc54ca0aacf2fc60bb36647a61a23559dda4bc), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7)]:
  - @tanstack/ai@0.52.0
