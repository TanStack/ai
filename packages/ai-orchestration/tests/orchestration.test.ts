import {
  createWorkflow,
  inMemoryRunStore,
  runWorkflow,
} from '@tanstack/workflow-core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { EventType } from '@tanstack/ai'
import {
  AgentApprovalUnsupportedError,
  agentMiddleware,
  createAIEventPublisher,
  defineAgent,
  toAIStream,
} from '../src'
import type { StreamChunk } from '@tanstack/ai'
import type { WorkflowEvent } from '@tanstack/workflow-core'

describe('Workflow-backed agent orchestration', () => {
  it('runs a streamed agent as a Workflow step and projects AG-UI events', async () => {
    let calls = 0
    const writer = defineAgent({
      name: 'writer',
      input: z.object({ topic: z.string() }),
      output: z.object({ article: z.string() }),
      run: ({ input }) => {
        calls += 1
        return streamText(JSON.stringify({ article: `About ${input.topic}` }))
      },
    })
    const workflow = createWorkflow({
      id: 'article',
      input: z.object({ topic: z.string() }),
    })
      .middleware([agentMiddleware()])
      .handler((ctx) =>
        ctx.ai.agent('draft', writer, { topic: ctx.input.topic }),
      )

    const chunks = await collect(
      toAIStream(
        runWorkflow({
          workflow,
          runStore: inMemoryRunStore(),
          input: { topic: 'workflows' },
        }),
      ),
    )

    expect(calls).toBe(1)
    expect(chunks.filter((chunk) => chunk.type === 'RUN_STARTED')).toHaveLength(
      1,
    )
    expect(
      chunks.filter((chunk) => chunk.type === 'RUN_FINISHED'),
    ).toHaveLength(1)
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'STEP_STARTED',
        stepName: 'writer',
        stepId: 'draft',
        stepType: 'agent',
      }),
    )
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'TEXT_MESSAGE_CONTENT',
        delta: '{"article":"About workflows"}',
      }),
    )
    expect(chunks.at(-1)).toEqual(
      expect.objectContaining({
        type: 'RUN_FINISHED',
        result: { article: 'About workflows' },
      }),
    )
  })

  it('replays a completed agent step when an approval resumes the workflow', async () => {
    let calls = 0
    const researcher = defineAgent({
      name: 'researcher',
      input: z.object({ query: z.string() }),
      output: z.object({ finding: z.string() }),
      run: async ({ input }) => {
        calls += 1
        return { finding: input.query.toUpperCase() }
      },
    })
    const workflow = createWorkflow({
      id: 'research',
      input: z.object({ query: z.string() }),
    })
      .middleware([agentMiddleware()])
      .handler(async (ctx) => {
        const result = await ctx.ai.agent('research', researcher, ctx.input)
        const approval = await ctx.approve({ title: 'Publish?' })
        return { ...result, approved: approval.approved }
      })
    const runStore = inMemoryRunStore()

    const firstEvents = await collect(
      runWorkflow({
        workflow,
        runStore,
        input: { query: 'durability' },
      }),
    )
    const runId = findRunId(firstEvents)
    const approval = firstEvents.find(
      (
        event,
      ): event is Extract<WorkflowEvent, { type: 'APPROVAL_REQUESTED' }> =>
        event.type === 'APPROVAL_REQUESTED',
    )

    expect(approval).toBeDefined()
    expect((await runStore.getRunState(runId))?.status).toBe('paused')

    const resumedEvents = await collect(
      runWorkflow({
        workflow,
        runStore,
        runId,
        approval: {
          approvalId: approval!.approvalId,
          approved: true,
        },
      }),
    )

    expect(calls).toBe(1)
    expect(resumedEvents.at(-1)).toEqual(
      expect.objectContaining({
        type: 'RUN_FINISHED',
        output: { finding: 'DURABILITY', approved: true },
      }),
    )
    expect((await runStore.getRunState(runId))?.status).toBe('finished')
  })

  it('inherits automatic deadline yielding before starting an agent step', async () => {
    let calls = 0
    const worker = defineAgent({
      name: 'worker',
      run: async () => {
        calls += 1
        return 'done'
      },
    })
    const workflow = createWorkflow({ id: 'deadline' })
      .middleware([agentMiddleware()])
      .handler((ctx) => ctx.ai.agent('work', worker, undefined))
    const runStore = inMemoryRunStore()

    const yieldedEvents = await collect(
      runWorkflow({
        workflow,
        runStore,
        input: {},
        deadline: Date.now() + 10,
        minYieldRemainingMs: 1_000,
      }),
    )
    const runId = findRunId(yieldedEvents)

    expect(calls).toBe(0)
    expect(yieldedEvents).toContainEqual(
      expect.objectContaining({ type: 'SIGNAL_AWAITED', name: '__timer' }),
    )
    expect((await runStore.getRunState(runId))?.status).toBe('paused')

    const resumedEvents = await collect(
      runWorkflow({
        workflow,
        runStore,
        runId,
        signalDelivery: {
          signalId: 'deadline-resume',
          name: '__timer',
          payload: undefined,
        },
        deadline: Date.now() + 60_000,
      }),
    )

    expect(calls).toBe(1)
    expect(resumedEvents.at(-1)?.type).toBe('RUN_FINISHED')
  })

  it('does not checkpoint an AI tool approval as completed agent output', async () => {
    const interactive = defineAgent({
      name: 'interactive',
      run: () => approvalStream(),
    })
    const workflow = createWorkflow({ id: 'interactive' })
      .middleware([agentMiddleware()])
      .handler((ctx) => ctx.ai.agent('interactive', interactive, undefined))
    const events = await collect(
      runWorkflow({
        workflow,
        runStore: inMemoryRunStore(),
        input: {},
      }),
    )

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'STEP_FAILED',
        error: expect.objectContaining({
          name: AgentApprovalUnsupportedError.name,
        }),
      }),
    )
    expect(events.some((event) => event.type === 'RUN_FINISHED')).toBe(false)
  })

  it('adapts the Workflow publish hook without changing execution IDs', async () => {
    const published: Array<{ runId: string; chunk: StreamChunk }> = []
    const publisher = createAIEventPublisher({
      mapping: { runId: (workflowRunId) => `ai:${workflowRunId}` },
      publish: (runId, chunk) => {
        published.push({ runId, chunk })
      },
    })
    const workflow = createWorkflow({ id: 'publisher' }).handler(async () =>
      Promise.resolve('done'),
    )

    const events = await collect(
      runWorkflow({
        workflow,
        runStore: inMemoryRunStore(),
        input: {},
        publish: publisher,
      }),
    )
    const workflowRunId = findRunId(events)

    expect(published.map((entry) => entry.runId)).toEqual([
      `ai:${workflowRunId}`,
      `ai:${workflowRunId}`,
    ])
    expect(published.map((entry) => entry.chunk.type)).toEqual([
      'RUN_STARTED',
      'RUN_FINISHED',
    ])
  })
})

async function* streamText(text: string): AsyncIterable<StreamChunk> {
  yield {
    type: EventType.RUN_STARTED,
    runId: 'inner-run',
    threadId: 'inner-thread',
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'message-1',
    role: 'assistant',
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'message-1',
    delta: text,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId: 'message-1',
    timestamp: Date.now(),
  }
  yield {
    type: EventType.RUN_FINISHED,
    runId: 'inner-run',
    threadId: 'inner-thread',
    timestamp: Date.now(),
  }
}

async function* approvalStream(): AsyncIterable<StreamChunk> {
  yield {
    type: 'CUSTOM',
    name: 'approval-requested',
    value: {
      toolCallId: 'tool-call-1',
      toolName: 'write_file',
      input: {},
      approval: { id: 'approval-1', needsApproval: true },
    },
    timestamp: Date.now(),
  }
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<Array<T>> {
  const values: Array<T> = []
  for await (const value of iterable) values.push(value)
  return values
}

function findRunId(events: ReadonlyArray<WorkflowEvent>): string {
  const started = events.find(
    (event): event is Extract<WorkflowEvent, { type: 'RUN_STARTED' }> =>
      event.type === 'RUN_STARTED',
  )
  if (!started) throw new Error('RUN_STARTED not found')
  return started.runId
}
