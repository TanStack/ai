---
'@tanstack/ai': minor
'@tanstack/ai-compaction': minor
'@tanstack/ai-harness': minor
'@tanstack/ai-mcp': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-sandbox': minor
---

Core support for the harness: subagent binding options, the `onGuardToolCall` hook, server-side BYOK keys, harness tool runs, checked streamed `outputSchema` results, and resume fixes.

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
