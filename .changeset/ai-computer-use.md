---
'@tanstack/ai-computer-use': minor
'@tanstack/ai-computer-playwright': minor
'@tanstack/ai-computer-e2b': minor
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-anthropic': minor
---

Add computer use that runs the same code on OpenAI and on Anthropic. A driver controls the machine.

- `@tanstack/ai-computer-use` adds `createComputerUse()`. It returns a tool, a middleware, and a safety-check interrupt for `chat()`.
- `@tanstack/ai-computer-playwright` adds `createPlaywrightComputerDriver()`. It controls a Playwright page.
- `@tanstack/ai-computer-e2b` adds `createE2BComputerDriver()`. It controls a Linux desktop in an E2B sandbox.
- `@tanstack/ai-anthropic` and `@tanstack/openai-base` send the generic computer tool to the model as the native computer tool of the provider. `@tanstack/ai` adds the metadata reader for this in `@tanstack/ai/adapter-internals`.
- `@tanstack/ai-openai` marks the models that support the `computer` tool.

```ts
const { tool, middleware, interrupt } = createComputerUse({
  driver: createPlaywrightComputerDriver({ page }),
})

chat({
  adapter,
  messages,
  tools: [tool],
  middleware: [middleware],
  interrupts: [interrupt],
})
```
