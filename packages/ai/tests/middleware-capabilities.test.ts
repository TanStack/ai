import { describe, it, expect, vi } from 'vitest'
import {
  createCapability,
  CapabilityRegistry,
} from '../src/activities/chat/middleware/capabilities'
import type { CapabilityContext } from '../src/activities/chat/middleware/capabilities'
import { MiddlewareRunner } from '../src/activities/chat/middleware/compose'
import { resolveDebugOption } from '../src/logger/resolve'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
} from '../src/activities/chat/middleware/types'

// A capability accessor only needs `ctx.capabilities`, so test contexts are
// typed against the minimal CapabilityContext — no casts.
function makeCtx(): CapabilityContext {
  return { capabilities: new CapabilityRegistry() }
}

describe('createCapability + CapabilityRegistry', () => {
  it('provides and gets a value by handle reference', () => {
    const cap = createCapability<{ n: number }>('thing')
    const [getThing, provideThing] = cap
    const ctx = makeCtx()
    provideThing(ctx, { n: 1 })
    expect(getThing(ctx)).toEqual({ n: 1 })
  })

  it('get throws a named error when absent', () => {
    const [getThing] = createCapability<number>('counter')
    const ctx = makeCtx()
    expect(() => getThing(ctx)).toThrowError(/capability "counter".*never provided/i)
  })

  it('get with { optional: true } returns undefined when absent', () => {
    const [getThing] = createCapability<number>('counter')
    const ctx = makeCtx()
    expect(getThing(ctx, { optional: true })).toBeUndefined()
  })

  it('two capabilities with the same name are distinct identities', () => {
    const [getA, provideA] = createCapability<string>('dup')
    const [getB] = createCapability<string>('dup')
    const ctx = makeCtx()
    provideA(ctx, 'a')
    expect(getA(ctx)).toBe('a')
    expect(getB(ctx, { optional: true })).toBeUndefined()
  })

  it('exposes capabilityName for diagnostics', () => {
    const cap = createCapability<number>('labelled')
    expect(cap.capabilityName).toBe('labelled')
  })

  it('duplicate provide is last-wins and notifies the registry', () => {
    const [getThing, provideThing] = createCapability<number>('over')
    const ctx = makeCtx()
    const warn = vi.fn()
    ctx.capabilities.setOnDuplicate(warn)
    provideThing(ctx, 1)
    provideThing(ctx, 2)
    expect(getThing(ctx)).toBe(2)
    expect(warn).toHaveBeenCalledWith('over')
  })
})

// runSetup forwards the full stable context to each setup hook and to
// instrumentation, so the test builds a complete (inert) ChatMiddlewareContext
// — typed against the real interface, no casts.
function makeRunnerCtx(): ChatMiddlewareContext {
  return {
    requestId: 'r',
    streamId: 's',
    runId: 'run',
    threadId: 't',
    phase: 'init',
    iteration: 0,
    chunkIndex: 0,
    abort: () => {},
    context: undefined,
    defer: () => {},
    provider: 'test',
    model: 'test-model',
    source: 'server',
    streaming: true,
    systemPrompts: [],
    messageCount: 0,
    hasTools: false,
    currentMessageId: null,
    accumulatedContent: '',
    messages: [],
    createId: (prefix) => `${prefix}-id`,
    capabilities: new CapabilityRegistry(),
  }
}

describe('MiddlewareRunner.runSetup', () => {
  it('runs setup hooks in array order before consumers can read', async () => {
    const aCap = createCapability<number>('order-a')
    const [getA, provideA] = aCap
    const order: Array<string> = []
    const provider: ChatMiddleware = {
      name: 'provider',
      provides: [aCap],
      setup(ctx) {
        order.push('provider')
        provideA(ctx, 7)
      },
    }
    const consumer: ChatMiddleware = {
      name: 'consumer',
      requires: [aCap],
      setup(ctx) {
        order.push('consumer')
        expect(getA(ctx)).toBe(7)
      },
    }
    const runner = new MiddlewareRunner(
      [provider, consumer],
      resolveDebugOption(false),
    )
    await runner.runSetup(makeRunnerCtx())
    expect(order).toEqual(['provider', 'consumer'])
  })

  it('throws if a middleware declares provides but never provides in setup', async () => {
    const cap = createCapability<number>('declared-not-provided')
    const broken: ChatMiddleware = {
      name: 'broken',
      provides: [cap],
      setup() {},
    }
    const runner = new MiddlewareRunner([broken], resolveDebugOption(false))
    await expect(runner.runSetup(makeRunnerCtx())).rejects.toThrow(
      /middleware "broken".*declares.*"declared-not-provided".*never called provide/i,
    )
  })
})
