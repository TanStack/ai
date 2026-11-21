import { describe, expect, it } from 'vitest'
import { MiddlewareRunner } from '../src/activities/chat/middleware/compose'
import { CapabilityRegistry } from '../src/activities/chat/middleware/capabilities'
import { resolveDebugOption } from '../src/logger/resolve'
import type {
  AfterToolCallInfo,
  ChatMiddleware,
  ChatMiddlewareContext,
} from '../src/activities/chat/middleware/types'

// The runner sends the context to instrumentation, so the test builds a
// complete (inert) context, typed against the real interface.
function makeRunnerCtx(): ChatMiddlewareContext {
  const ctx: ChatMiddlewareContext = {
    requestId: 'r',
    streamId: 's',
    runId: 'run',
    threadId: 't',
    activity: 'chat',
    phase: 'afterTools',
    iteration: 0,
    chunkIndex: 0,
    callMetadata: {},
    abort: () => {},
    retry: () => {},
    emitCustomEvent: () => {},
    context: undefined,
    defer: () => {},
    provider: 'test',
    model: 'test-model',
    source: 'server',
    streaming: true,
    systemPrompts: [],
    messageCount: 0,
    hasTools: true,
    currentMessageId: null,
    accumulatedContent: '',
    messages: [],
    activities: [],
    createId: (prefix) => `${prefix}-id`,
    capabilities: new CapabilityRegistry(),
    get: (capability) => capability[0](ctx),
    getOptional: (capability) => capability[0](ctx, { optional: true }),
    provide: (capability, value) => capability[1](ctx, value),
  }
  return ctx
}

function makeInfo(metadata?: Record<string, unknown>): AfterToolCallInfo {
  return {
    toolCall: {
      id: 'tc-1',
      type: 'function',
      function: { name: 'lookup', arguments: '{}' },
    },
    tool: undefined,
    toolName: 'lookup',
    toolCallId: 'tc-1',
    ok: true,
    duration: 1,
    result: { rows: 500 },
    metadata,
  }
}

/**
 * Run the onAfterToolCall chain. A last middleware records the
 * `info.metadata` that it sees. Give back that value and the final decision.
 */
async function runChain(
  middleware: Array<ChatMiddleware>,
  incoming?: Record<string, unknown>,
) {
  let seen: Record<string, unknown> | undefined
  const observer: ChatMiddleware = {
    name: 'observer',
    onAfterToolCall: (_ctx, info) => {
      seen = info.metadata
    },
  }
  const runner = new MiddlewareRunner(
    [...middleware, observer],
    resolveDebugOption(false),
  )
  const decision = await runner.runOnAfterToolCall(
    makeRunnerCtx(),
    makeInfo(incoming),
  )
  return { seen, decision }
}

function replaceWith(
  result: unknown,
  metadata?: Record<string, unknown>,
): ChatMiddleware {
  return {
    name: 'replace',
    onAfterToolCall: () => ({ type: 'replaceResult', result, metadata }),
  }
}

describe('onAfterToolCall result metadata', () => {
  it('gives the replaced metadata to the next middleware and the final decision', async () => {
    const { seen, decision } = await runChain(
      [replaceWith('trimmed', { b: 1 })],
      { a: 1 },
    )

    expect(seen).toEqual({ b: 1 })
    expect(decision).toEqual({
      type: 'replaceResult',
      result: 'trimmed',
      metadata: { b: 1 },
    })
  })

  it('keeps the current metadata when a replacement has no metadata', async () => {
    const { seen, decision } = await runChain([replaceWith('trimmed')], {
      a: 1,
    })

    expect(seen).toEqual({ a: 1 })
    expect(decision).toEqual({
      type: 'replaceResult',
      result: 'trimmed',
      metadata: { a: 1 },
    })
  })

  it('removes all metadata when a replacement sets an empty object', async () => {
    const { seen, decision } = await runChain([replaceWith('trimmed', {})], {
      a: 1,
    })

    expect(seen).toEqual({})
    expect(decision).toEqual({
      type: 'replaceResult',
      result: 'trimmed',
      metadata: {},
    })
  })

  it('keeps metadata from an earlier replacement when a later one has none', async () => {
    const { seen, decision } = await runChain(
      [replaceWith('trimmed', { b: 1 }), replaceWith('summary')],
      { a: 1 },
    )

    expect(seen).toEqual({ b: 1 })
    expect(decision).toEqual({
      type: 'replaceResult',
      result: 'summary',
      metadata: { b: 1 },
    })
  })

  it('gives the incoming metadata to every middleware when none replaces', async () => {
    const { seen, decision } = await runChain([], { a: 1 })

    expect(seen).toEqual({ a: 1 })
    expect(decision).toBeUndefined()
  })
})
