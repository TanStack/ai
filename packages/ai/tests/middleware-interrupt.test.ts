import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { aiEventClient } from '@tanstack/ai-event-client'
import { defineInterrupt } from '../src/interrupt-definition'
import { InternalLogger } from '../src/logger/internal-logger'
import type { ResolvedCategories } from '../src/logger/internal-logger'
import { MiddlewareRunner } from '../src/activities/chat/middleware/compose'
import { CapabilityRegistry } from '../src/activities/chat/middleware/capabilities'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
  InterruptBoundaryPhase,
} from '../src/activities/chat/middleware/types'

const categories: ResolvedCategories = {
  request: false,
  provider: false,
  output: false,
  middleware: false,
  tools: false,
  agentLoop: false,
  config: false,
  errors: false,
  sandbox: false,
}

const logger = new InternalLogger(
  { debug() {}, info() {}, warn() {}, error() {} },
  categories,
)

const context: ChatMiddlewareContext = {
  requestId: 'request',
  streamId: 'stream',
  runId: 'run',
  threadId: 'thread',
  phase: 'beforeModel',
  iteration: 0,
  chunkIndex: 0,
  abort() {},
  emitCustomEvent() {},
  context: undefined,
  defer() {},
  activity: 'chat',
  provider: 'provider',
  model: 'model',
  source: 'server',
  streaming: true,
  systemPrompts: [],
  messageCount: 0,
  hasTools: false,
  currentMessageId: null,
  accumulatedContent: '',
  messages: [],
  createId: (prefix) => prefix,
  capabilities: new CapabilityRegistry(),
  get: () => {
    throw new Error('unused in middleware interrupt tests')
  },
  getOptional: () => undefined,
  provide() {},
}

const approval = defineInterrupt({
  id: 'middleware-approval',
  responseSchema: z.object({ approved: z.boolean() }),
})

describe('generic interrupt middleware composition', () => {
  it('runs every boundary hook in order and aggregates requests', async () => {
    const phases: InterruptBoundaryPhase[] = [
      'beforeModel',
      'afterModel',
      'beforeTools',
      'afterTools',
    ]
    const calls: string[] = []
    const firstRequest = approval.interrupt({
      key: 'first',
      reason: 'test',
      message: 'First',
    })
    const secondRequest = approval.interrupt({
      key: 'second',
      reason: 'test',
      message: 'Second',
    })
    const first: ChatMiddleware<unknown, typeof approval> = {
      onInterruptBoundary(ctx) {
        calls.push(`first:${ctx.phase}`)
        return { interrupts: [firstRequest] }
      },
    }
    const second: ChatMiddleware<unknown, typeof approval> = {
      onInterruptBoundary(ctx) {
        calls.push(`second:${ctx.phase}`)
        return { interrupts: [secondRequest] }
      },
    }
    const runner = new MiddlewareRunner<unknown, typeof approval>(
      [first, second],
      logger,
    )

    const requestsByPhase = []
    for (const phase of phases) {
      requestsByPhase.push(
        await runner.runOnInterruptBoundary({ ...context, phase }),
      )
    }

    expect(requestsByPhase).toEqual(
      phases.map(() => [firstRequest, secondRequest]),
    )
    expect(calls).toEqual(
      phases.flatMap((phase) => [`first:${phase}`, `second:${phase}`]),
    )
    expect(phases).toHaveLength(4)
  })

  it('handles void boundary results and composes the last resolution decision', async () => {
    const first: ChatMiddleware<unknown, typeof approval> = {
      onInterruptBoundary() {},
      onInterruptResolution() {
        return { toolResume: 'continue' }
      },
    }
    const second: ChatMiddleware<unknown, typeof approval> = {
      onInterruptBoundary() {},
      onInterruptResolution() {
        return { toolResume: 'stop' }
      },
    }
    const runner = new MiddlewareRunner<unknown, typeof approval>(
      [first, second],
      logger,
    )

    await expect(
      runner.runOnInterruptBoundary({ ...context, phase: 'afterTools' }),
    ).resolves.toEqual([])
    await expect(
      runner.runOnInterruptResolution(context, {
        for: () => [],
        all: () => [],
      }),
    ).resolves.toEqual({ toolResume: 'stop' })
  })

  it('instruments lifecycle hooks and skips internal middleware', async () => {
    const events: Array<{
      middlewareName: string
      hookName: string
      duration: number
    }> = []
    const unsubscribe = aiEventClient.on(
      'middleware:hook:executed',
      (event) => {
        events.push(event.payload)
      },
      { withEventTarget: true },
    )
    const visible: ChatMiddleware<unknown, typeof approval> = {
      name: 'visible',
      onInterruptBoundary() {},
      onInterruptResolution() {},
    }
    const internal: ChatMiddleware<unknown, typeof approval> = {
      name: 'devtools',
      onInterruptBoundary() {},
      onInterruptResolution() {},
    }
    const runner = new MiddlewareRunner<unknown, typeof approval>(
      [visible, internal],
      logger,
    )

    await runner.runOnInterruptBoundary({ ...context, phase: 'beforeModel' })
    await runner.runOnInterruptResolution(context, {
      for: () => [],
      all: () => [],
    })
    unsubscribe()

    expect(events).toHaveLength(2)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          middlewareName: 'visible',
          hookName: 'onInterruptBoundary',
        }),
        expect.objectContaining({
          middlewareName: 'visible',
          hookName: 'onInterruptResolution',
        }),
      ]),
    )
    expect(events.every((event) => event.duration >= 0)).toBe(true)
  })
})
