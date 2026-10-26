# @tanstack/ai-orchestration

Durable TanStack AI agent calls powered by TanStack Workflow.

```ts
import { chat } from '@tanstack/ai'
import {
  agentMiddleware,
  defineAgent,
  toAIStream,
} from '@tanstack/ai-orchestration'
import { openaiText } from '@tanstack/ai-openai'
import {
  createWorkflow,
  inMemoryRunStore,
  runWorkflow,
} from '@tanstack/workflow-core'
import { z } from 'zod'

const writer = defineAgent({
  name: 'writer',
  input: z.object({ topic: z.string() }),
  output: z.object({ article: z.string() }),
  run: ({ input, abortController }) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: [{ role: 'user', content: `Write about ${input.topic}` }],
      outputSchema: z.object({ article: z.string() }),
      stream: true,
      abortController,
    }),
})

const article = createWorkflow({
  id: 'article',
  input: z.object({ topic: z.string() }),
})
  .middleware([agentMiddleware()])
  .handler(async (ctx) =>
    ctx.ai.agent('draft', writer, { topic: ctx.input.topic }),
  )

const workflowEvents = runWorkflow({
  workflow: article,
  runStore: inMemoryRunStore(),
  input: { topic: 'durable execution' },
})

for await (const chunk of toAIStream(workflowEvents)) {
  // Send AG-UI chunks to the client or a durable delivery stream.
}
```

Workflow owns execution, replay, retries, approvals, signals, deadlines, stores,
and leases. This package only defines agent-step ergonomics and maps Workflow
events to TanStack AI's AG-UI stream.

AI tool approvals inside an agent call are intentionally unsupported for now.
Use `ctx.approve()` between agent calls so Workflow can persist and resume the
pause.
