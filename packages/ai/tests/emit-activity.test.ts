import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, chat, defineActivityType, defineAgent } from '../src'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type {
  ActivityRecord,
  ChatMiddleware,
  StreamChunk,
  Tool,
  ToolExecutionContext,
} from '../src'

const deployProgress = defineActivityType({
  activityType: 'deploy.progress',
  contentSchema: z.object({ step: z.number().min(1), total: z.number() }),
})

const firstStep = { step: 1, total: 3 }

/** The chunk that an emit of `firstStep` with the id `deploy-1` sends. */
const firstStepSnapshot = expect.objectContaining({
  type: EventType.ACTIVITY_SNAPSHOT,
  messageId: 'deploy-1',
  activityType: 'deploy.progress',
  content: firstStep,
  replace: true,
})

type DeployExecute = NonNullable<Tool['execute']>

/**
 * Run a turn (message `msg-1`) that calls the `deploy` tool, then a turn
 * (message `msg-2`) that ends the run. Give back the stream, the
 * `ctx.activities` that `onFinish` sees, and the logger.
 */
async function runDeploy({
  deploy = () => 'deployed',
  middleware = [],
}: {
  deploy?: DeployExecute
  middleware?: Array<ChatMiddleware>
}) {
  const { adapter } = createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ev.textStart('msg-1'),
        ev.textContent('Deploying', 'msg-1'),
        ev.textEnd('msg-1'),
        ev.toolStart('call-1', 'deploy'),
        ev.toolArgs('call-1', '{}'),
        ev.toolEnd('call-1'),
        ev.runFinished('tool_calls'),
      ],
      [
        ev.runStarted(),
        ev.textStart('msg-2'),
        ev.textContent('Done', 'msg-2'),
        ev.textEnd('msg-2'),
        ev.runFinished('stop'),
      ],
    ],
  })
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  let activities: ReadonlyArray<ActivityRecord> = []
  const probe: ChatMiddleware = {
    name: 'activities-probe',
    onFinish(ctx) {
      activities = ctx.activities ?? []
    },
  }
  const chunks = await collectChunks(
    chat({
      adapter,
      threadId: 'thread-1',
      messages: [{ role: 'user', content: 'Deploy the app' }],
      tools: [
        { name: 'deploy', description: 'Deploy the app', execute: deploy },
      ],
      middleware: [probe, ...middleware],
      debug: { logger },
    }),
  )
  return { chunks, activities, logger }
}

/** A `deploy` tool that emits `firstStep` with the id `deploy-1`. */
const emitFirstStep: DeployExecute = (_args, context) => {
  context?.emitActivity?.(deployProgress, 'deploy-1', firstStep)
  return 'deployed'
}

function activitySnapshots(chunks: Array<StreamChunk>) {
  return chunks.filter((chunk) => chunk.type === EventType.ACTIVITY_SNAPSHOT)
}

describe('emitActivity', () => {
  it('sends an ACTIVITY_SNAPSHOT from a server tool', async () => {
    const { chunks } = await runDeploy({ deploy: emitFirstStep })

    expect(activitySnapshots(chunks)).toEqual([firstStepSnapshot])
  })

  it('sends an ACTIVITY_SNAPSHOT from a middleware', async () => {
    const { chunks } = await runDeploy({
      middleware: [
        {
          name: 'deploy-status',
          onStart(ctx) {
            ctx.emitActivity(deployProgress, 'deploy-1', firstStep)
          },
        },
      ],
    })

    expect(activitySnapshots(chunks)).toEqual([firstStepSnapshot])
  })

  it('sends an ACTIVITY_SNAPSHOT emitted in onFinish', async () => {
    const { chunks } = await runDeploy({
      middleware: [
        {
          name: 'deploy-status',
          onFinish(ctx) {
            ctx.emitActivity(deployProgress, 'deploy-1', firstStep)
          },
        },
      ],
    })

    expect(activitySnapshots(chunks)).toEqual([firstStepSnapshot])
  })

  it('keeps a row emitted in init onConfig in ctx.activities at onFinish', async () => {
    const { chunks, activities } = await runDeploy({
      middleware: [
        {
          name: 'deploy-status',
          onConfig(ctx) {
            if (ctx.phase === 'init') {
              ctx.emitActivity(deployProgress, 'deploy-1', firstStep)
            }
          },
        },
      ],
    })

    expect(activitySnapshots(chunks)).toEqual([firstStepSnapshot])
    expect(activities).toEqual([
      expect.objectContaining({ id: 'deploy-1', content: firstStep }),
    ])
  })

  it('keeps the place that onConfig gives a row of setup', async () => {
    const { activities } = await runDeploy({
      middleware: [
        {
          name: 'sandbox',
          setup(ctx) {
            ctx.emitActivity(deployProgress, 'deploy-1', firstStep)
          },
        },
        {
          name: 'persistence',
          // Like withPersistence: the stored thread moves the row further.
          onConfig(ctx) {
            if (ctx.phase !== 'init') return
            return {
              activities: (ctx.activities ?? []).map((record) => ({
                ...record,
                index: 5,
              })),
            }
          },
        },
      ],
    })

    expect(activities).toEqual([
      expect.objectContaining({ id: 'deploy-1', content: firstStep, index: 5 }),
    ])
  })

  it('fails the tool call when the content fails the schema check', async () => {
    const { chunks } = await runDeploy({
      deploy: (_args, context) => {
        context?.emitActivity?.(deployProgress, 'deploy-1', {
          step: 0,
          total: 3,
        })
        return 'deployed'
      },
    })

    expect(activitySnapshots(chunks)).toEqual([])
    expect(
      chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_RESULT),
    ).toMatchObject({
      toolCallId: 'call-1',
      content: expect.stringContaining(
        "Content check failed for activity type 'deploy.progress'",
      ),
    })
  })

  it('has the new row in ctx.activities when a middleware gets the snapshot', async () => {
    let rowContent: unknown
    await runDeploy({
      deploy: emitFirstStep,
      middleware: [
        {
          name: 'row-reader',
          onChunk(ctx, chunk) {
            if (chunk.type !== EventType.ACTIVITY_SNAPSHOT) return
            rowContent = ctx.activities?.find(
              (row) => row.id === 'deploy-1',
            )?.content
          },
        },
      ],
    })

    expect(rowContent).toEqual(firstStep)
  })

  it.each([
    ['an earlier message', 'msg-2'],
    ['the message that streams', 'msg-1'],
  ])(
    'drops a row with the id of %s, logs a warning, and finishes the run',
    async (_case, streamingId) => {
      const { chunks, activities, logger } = await runDeploy({
        middleware: [
          {
            name: 'emit-with-message-id',
            onChunk(ctx, chunk) {
              const isStart =
                chunk.type === EventType.TEXT_MESSAGE_START &&
                chunk.messageId === streamingId
              if (isStart) ctx.emitActivity(deployProgress, 'msg-1', firstStep)
            },
          },
        ],
      })

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "ACTIVITY_SNAPSHOT id 'msg-1' is the id of a message",
        ),
        { messageId: 'msg-1', activityType: 'deploy.progress' },
      )
      expect(activities).toEqual([])
      expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    },
  )

  it('does not throw for an emit after the run ended', async () => {
    const late: { toolEmit?: ToolExecutionContext['emitActivity'] } = {}
    let middlewareEmit = () => {}
    await runDeploy({
      deploy: (_args, context) => {
        late.toolEmit = context?.emitActivity
        return 'deployed'
      },
      middleware: [
        {
          name: 'late-emit',
          onFinish(ctx) {
            middlewareEmit = () =>
              ctx.emitActivity(deployProgress, 'deploy-2', firstStep)
          },
        },
      ],
    })

    expect(late.toolEmit).toBeTypeOf('function')
    expect(() =>
      late.toolEmit?.(deployProgress, 'deploy-1', firstStep),
    ).not.toThrow()
    expect(middlewareEmit).not.toThrow()
  })

  it('does not throw in a tool context without emitActivity', () => {
    // An MCP server, WebMCP, or a direct `execute()` call gives a context
    // like this one. It type-checks only while `emitActivity` is optional.
    const context: ToolExecutionContext = { emitCustomEvent: () => {} }

    expect(emitFirstStep({}, context)).toBe('deployed')
  })

  it('applies a delta that a subagent forwards once', async () => {
    const child = createMockAdapter({
      iterations: [
        [
          ev.runStarted('child-run', 'child-thread'),
          ev.activitySnapshot('list-1', 'search', { items: [] }),
          ev.activityDelta('list-1', 'search', [
            { op: 'add', path: '/items/-', value: 'x' },
          ]),
          ev.runFinished('stop', 'child-run', undefined, 'child-thread'),
        ],
      ],
    })
    const researcher = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      run: (ctx) =>
        chat({
          adapter: child.adapter,
          messages: ctx.messages,
          threadId: ctx.threadId,
          runId: ctx.runId,
        }),
    })
    const parent = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('call-1', 'researcher'),
          ev.toolArgs('call-1', '{}'),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.runFinished('stop')],
      ],
    })
    let activities: ReadonlyArray<ActivityRecord> = []
    await collectChunks(
      chat({
        adapter: parent.adapter,
        threadId: 'thread-1',
        messages: [{ role: 'user', content: 'Research this' }],
        subagents: { agents: [researcher] },
        middleware: [
          {
            name: 'activities-probe',
            onFinish(ctx) {
              activities = ctx.activities ?? []
            },
          },
        ],
      }),
    )

    expect(activities).toEqual([
      expect.objectContaining({ id: 'list-1', content: { items: ['x'] } }),
    ])
  })
})
