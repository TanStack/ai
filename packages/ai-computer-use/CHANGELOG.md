# @tanstack/ai-computer-use

## 1.1.1

### Patch Changes

- Updated dependencies [[`e8546f9`](https://github.com/TanStack/ai/commit/e8546f90834ace0129c4e2b5491909ea87e07f20), [`5fd5355`](https://github.com/TanStack/ai/commit/5fd535501784df0102880470835913ceec3a8e1e), [`9393839`](https://github.com/TanStack/ai/commit/9393839d380dde91fa91e81b5e92448610e9782a), [`215e339`](https://github.com/TanStack/ai/commit/215e3396eb907054baddbf3423da8bc3e90ecf50), [`7157ef3`](https://github.com/TanStack/ai/commit/7157ef3e8556ac23c350822ba0f3c4bbf0abb118)]:
  - @tanstack/ai@1.3.0
  - @tanstack/ai-harness@0.3.0

## 1.1.0

### Minor Changes

- [#1978](https://github.com/TanStack/ai/pull/1978) [`4caefd7`](https://github.com/TanStack/ai/commit/4caefd7cb6783766fb2bdb9d34d65b367624dd32) - `ComputerDriverFactory.create({ threadId, signal })` gets the abort signal of the tool call that needs the machine.

- [#1978](https://github.com/TanStack/ai/pull/1978) [`4caefd7`](https://github.com/TanStack/ai/commit/4caefd7cb6783766fb2bdb9d34d65b367624dd32) - Each `ComputerDriver` action takes an optional `signal`, for example `move(x, y, { signal })` and `click(x, y, { button, count, signal })`. The computer tools pass the abort signal of the tool call to each action. An abort also stops the `wait` and `hold_key` waits and the wait before the screenshot. `keyUp` and `mouseUp` get no signal, so held keys and buttons are released after an abort.

### Patch Changes

- [#1976](https://github.com/TanStack/ai/pull/1976) [`5f62940`](https://github.com/TanStack/ai/commit/5f62940bb15c871a205de70e4e6b58fbe5016960) - An aborted computer action no longer runs when it waits in the queue. A `wait`, `hold_key`, a repeated key press, a `navigate`, or the next action of a batch now stops when the call aborts. Held keys are still released. A drag does not start after an abort. A drag that started goes to its end point, because a release in the middle drops the item at the wrong point.

- Updated dependencies [[`5f62940`](https://github.com/TanStack/ai/commit/5f62940bb15c871a205de70e4e6b58fbe5016960), [`9ac67f3`](https://github.com/TanStack/ai/commit/9ac67f3acbcecee88714503b205d602560fdc8c6), [`9ac67f3`](https://github.com/TanStack/ai/commit/9ac67f3acbcecee88714503b205d602560fdc8c6), [`4caefd7`](https://github.com/TanStack/ai/commit/4caefd7cb6783766fb2bdb9d34d65b367624dd32), [`e17cae7`](https://github.com/TanStack/ai/commit/e17cae7aa40ce5ebe0e78496931d49c793bdaf41), [`d6ead13`](https://github.com/TanStack/ai/commit/d6ead13def85f91782e20d6c1b8755fdf1c836c2), [`450950d`](https://github.com/TanStack/ai/commit/450950da860d58047c654c1497ddb48d651f9076), [`07d2e42`](https://github.com/TanStack/ai/commit/07d2e429c456a31d35748fecf7d8f8c0795eff31), [`13b1ca9`](https://github.com/TanStack/ai/commit/13b1ca918a0ac36761db2a6226973c5330d4221d), [`09dde65`](https://github.com/TanStack/ai/commit/09dde65b9fdcc312fd0459c98328c23abd1406cb)]:
  - @tanstack/ai-harness@0.2.0
  - @tanstack/ai@1.1.0
  - @tanstack/ai-utils@1.0.1

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

- [#1755](https://github.com/TanStack/ai/pull/1755) [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983) - Add `computerUse()` in `@tanstack/ai-computer-use/harness`: computer use as a harness plugin.
  - Each screenshot goes to the media store of the session. The transcript and the log keep a small `harness-media:` reference.
  - The model gets only the newest `keepScreenshots` screenshots (3 by default). An older one goes to the model as a 1x1 image.
  - A call with OpenAI safety checks asks the user through `permissions()`, each time. Without `permissions()`, the call is refused.
  - The `plan` mode of `permissions()` refuses the `computer` tool.

  `@tanstack/ai-harness` is an optional peer dependency of `@tanstack/ai-computer-use`.

  A plugin can now store a file with `ctx.session.putMedia(upload)`, and put `mediaPart(record)` in a tool result.

### Patch Changes

- Updated dependencies [[`fcbd199`](https://github.com/TanStack/ai/commit/fcbd199a66b553acef0b81bc76c4b4acd7fde6a9), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`959f43e`](https://github.com/TanStack/ai/commit/959f43e4b11112f2c097f642bdec34d8d0f83e27), [`a5c2af3`](https://github.com/TanStack/ai/commit/a5c2af3e93b8359209ea3c44856e4c06599387dc), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`fa2a291`](https://github.com/TanStack/ai/commit/fa2a291f5526f6dec9a91fe5b71de15dfaf59ec7), [`f7e7cce`](https://github.com/TanStack/ai/commit/f7e7cce8f2d543a7480b626b7985417e054bfd8d), [`7a0a48b`](https://github.com/TanStack/ai/commit/7a0a48bac8b531a90e768c87cb645da2fc8d3f31), [`468063c`](https://github.com/TanStack/ai/commit/468063c07cd904be97b154b415163c23510834b2), [`fe83aa0`](https://github.com/TanStack/ai/commit/fe83aa05fe2346c50693664d4a4896d4fc1fea5a), [`781a3a8`](https://github.com/TanStack/ai/commit/781a3a82c870e246deff23c7aca32094e9aaaf2f), [`39abb7e`](https://github.com/TanStack/ai/commit/39abb7ed172b4357bc04a39fc6cf7c3577f77cf3), [`f1b3f65`](https://github.com/TanStack/ai/commit/f1b3f65a59fb75116bd52abbb162cab8c763d10e)]:
  - @tanstack/ai@1.0.0
  - @tanstack/ai-harness@0.1.0
  - @tanstack/ai-utils@1.0.0

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
  - @tanstack/ai@0.71.0
