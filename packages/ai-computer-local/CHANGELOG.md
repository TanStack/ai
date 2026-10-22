# @tanstack/ai-computer-local

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
