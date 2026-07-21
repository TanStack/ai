import { createFileRoute } from '@tanstack/react-router'
import { EventType, toServerSentEventsResponse } from '@tanstack/ai'
import {
  agentMiddleware,
  defineAgent,
  toAIStream,
} from '@tanstack/ai-orchestration'
import {
  createWorkflow,
  inMemoryRunStore,
  runWorkflow,
} from '@tanstack/workflow-core'
import type { StreamChunk } from '@tanstack/ai'

const writer = defineAgent({
  name: 'writer',
  run: () => fixedAgentStream(),
})

const workflow = createWorkflow({ id: 'e2e-orchestration' })
  .middleware([agentMiddleware()])
  .handler((ctx) => ctx.ai.agent('draft', writer, undefined))

async function* fixedAgentStream(): AsyncIterable<StreamChunk> {
  yield {
    type: EventType.RUN_STARTED,
    runId: 'inner-model-run',
    threadId: 'inner-model-thread',
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'workflow-message',
    role: 'assistant',
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'workflow-message',
    delta: 'Workflow-backed response',
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId: 'workflow-message',
    timestamp: Date.now(),
  }
  yield {
    type: EventType.RUN_FINISHED,
    runId: 'inner-model-run',
    threadId: 'inner-model-thread',
    timestamp: Date.now(),
  }
}

export const Route = createFileRoute('/api/workflow-orchestration')({
  server: {
    handlers: {
      POST: () =>
        toServerSentEventsResponse(
          toAIStream(
            runWorkflow({
              workflow,
              runStore: inMemoryRunStore(),
              input: {},
            }),
          ),
        ),
    },
  },
})
