---
'@tanstack/ai-computer-use': minor
'@tanstack/ai-computer-playwright': minor
'@tanstack/ai-computer-e2b': minor
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-anthropic': minor
---

Add computer use that runs the same code on OpenAI and on Anthropic. A driver controls the machine, and each thread gets its own machine.

New packages:

- `@tanstack/ai-computer-use` adds `createComputerUse()`. It returns `tools`, a middleware, a safety-check interrupt, and `close`. Each `threadId` gets its own machine, action queue, and approvals. A thread that stays idle for `idleTimeout` (10 minutes by default) closes.
- `@tanstack/ai-computer-playwright` adds `playwrightComputer()`, which opens one browser page for each thread. `createPlaywrightComputerDriver()` controls one page that you give it. Both add a `navigate` tool that opens `http:` and `https:` URLs.
- `@tanstack/ai-computer-e2b` adds `e2bComputer()`, which starts one E2B desktop sandbox for each thread. `createE2BComputerDriver()` controls one sandbox that you give it.

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
