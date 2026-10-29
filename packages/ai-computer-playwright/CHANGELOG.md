# @tanstack/ai-computer-playwright

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

- Updated dependencies [[`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`f1b3f65`](https://github.com/TanStack/ai/commit/f1b3f65a59fb75116bd52abbb162cab8c763d10e)]:
  - @tanstack/ai-computer-use@1.0.0

## 0.1.0

### Minor Changes

- [#1837](https://github.com/TanStack/ai/pull/1837) [`824ee98`](https://github.com/TanStack/ai/commit/824ee98060983dd2b5728f288cecefa6a1250325) - Add computer use that runs the same code on OpenAI and on Anthropic. A driver controls the machine. The Playwright and sandbox drivers give each thread its own machine.

  New packages:
  - `@tanstack/ai-computer-use` adds `createComputerUse()`. It returns `tools`, a middleware, a safety-check interrupt, and `close`. Each `threadId` gets its own machine, action queue, and approvals. A thread that stays idle for `idleTimeout` (10 minutes by default) closes.
  - `@tanstack/ai-computer-playwright` adds `playwrightComputer()`, which opens one browser page for each thread. `createPlaywrightComputerDriver()` controls one page that you give it. Both add a `navigate` tool that opens `http:` and `https:` URLs.
  - `@tanstack/ai-computer-sandbox` adds `sandboxComputer()`, which creates one Linux desktop sandbox for each thread from any `@tanstack/ai-sandbox` provider, like `e2bSandbox({ template: 'desktop' })`. `createSandboxComputerDriver()` controls one sandbox that you give it.
  - `@tanstack/ai-computer-local` adds `localComputer()`, which lets the model use the mouse, keyboard, and main screen of the machine that runs `chat()`. It works on Windows, macOS, and Linux with `@jitsi/robotjs`.

  Changes in existing packages:
  - `@tanstack/ai` adds `threadId` to `ToolExecutionContext`. It also adds the computer tool metadata reader in `@tanstack/ai/adapter-internals`.
  - `@tanstack/ai-anthropic` and `@tanstack/openai-base` send the generic computer tool to the model as the native computer tool of the provider.
  - `@tanstack/ai-openai` marks the models that support the `computer` tool.

  ```ts
  const computerUse = createComputerUse({
    driver: playwrightComputer({ startUrl: 'https://tanstack.com' }),
  })

  chat({
    adapter,
    messages,
    threadId,
    tools: computerUse.tools,
    middleware: [computerUse.middleware],
    interrupts: [computerUse.interrupt],
  })

  await computerUse.close(threadId) // one thread
  await computerUse.close() // every thread, and the browser
  ```

  The `ai-core` agent skill routes computer use to `@tanstack/ai-computer-use` and its three drivers.

### Patch Changes

- Updated dependencies [[`824ee98`](https://github.com/TanStack/ai/commit/824ee98060983dd2b5728f288cecefa6a1250325)]:
  - @tanstack/ai-computer-use@0.1.0
