import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '../src'
import {
  ToolCallManager,
  executeToolCalls,
} from '../src/activities/chat/tools/tool-calls'
import { ev } from './test-utils'
import type { ToolExecutionMiddlewareHooks } from '../src/activities/chat/tools/tool-calls'
import type { AnyTool, ToolCall } from '../src/types'

function call(id: string, name: string, args: unknown = {}): ToolCall {
  return {
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  }
}

/** Run the calls to the end and return the results. */
async function run(
  calls: Array<ToolCall>,
  tools: Array<AnyTool>,
  hooks?: ToolExecutionMiddlewareHooks,
) {
  const generator = executeToolCalls(
    calls,
    tools,
    'thread-1',
    new Map(),
    new Map(),
    undefined,
    hooks,
  )
  let next = await generator.next()
  while (!next.done) next = await generator.next()
  return next.value.results
}

/** A tool that sets `{ a: 1 }`, then returns 'ok'. */
const tagTool = toolDefinition({
  name: 'tag',
  description: 'Set result metadata',
  inputSchema: z.object({}),
}).server((_input, ctx) => {
  ctx?.setResultMetadata?.({ a: 1 })
  return 'ok'
})

describe('executeToolCalls result metadata', () => {
  it('puts the metadata on the result and gives it to the after hook', async () => {
    const seen: Array<unknown> = []
    const results = await run([call('tc-1', 'tag')], [tagTool], {
      onAfterToolCall: async (info) => {
        seen.push(info.metadata)
      },
    })

    expect(results[0]).toMatchObject({ result: 'ok', metadata: { a: 1 } })
    expect(seen).toEqual([{ a: 1 }])
  })

  it('keeps valid metadata on the error result when the tool throws', async () => {
    const tool = toolDefinition({
      name: 'fails',
      description: 'Set metadata, then throw',
      inputSchema: z.object({}),
    }).server((_input, ctx) => {
      ctx?.setResultMetadata?.({ attempt: 2 })
      throw new Error('disk full')
    })

    const results = await run([call('tc-1', 'fails')], [tool])

    expect(results[0]).toMatchObject({
      result: { error: 'disk full' },
      state: 'output-error',
      metadata: { attempt: 2 },
    })
  })

  it('fails the call and drops the metadata on a schema mismatch', async () => {
    const tool = toolDefinition({
      name: 'typed',
      description: 'Set metadata that fails the schema',
      inputSchema: z.object({}),
      resultMetadataSchema: z.object({ count: z.number().int() }),
    }).server((_input, ctx) => {
      ctx?.setResultMetadata?.({ count: 1.5 })
      return 'ok'
    })

    const results = await run([call('tc-1', 'typed')], [tool])

    expect(results[0]?.state).toBe('output-error')
    expect(results[0]?.result.error).toContain(
      'Result metadata validation failed for tool typed',
    )
    expect(results[0]?.metadata).toBeUndefined()
  })

  it('keeps the metadata of parallel calls apart', async () => {
    const tool = toolDefinition({
      name: 'slow',
      description: 'Set metadata before and after a wait',
      inputSchema: z.object({ id: z.string(), wait: z.number() }),
    }).server(async ({ id, wait }, ctx) => {
      ctx?.setResultMetadata?.({ id })
      await new Promise((resolve) => setTimeout(resolve, wait))
      ctx?.setResultMetadata?.({ done: id })
      return id
    })

    const results = await run(
      [
        call('tc-a', 'slow', { id: 'a', wait: 30 }),
        call('tc-b', 'slow', { id: 'b', wait: 0 }),
      ],
      [tool],
    )

    expect(results.map((result) => result.metadata)).toEqual([
      { id: 'a', done: 'a' },
      { id: 'b', done: 'b' },
    ])
  })

  it('replaces the metadata with replaceResult metadata', async () => {
    const results = await run([call('tc-1', 'tag')], [tagTool], {
      onAfterToolCall: async () => ({
        type: 'replaceResult',
        result: 'short',
        metadata: { trimmed: true },
      }),
    })

    expect(results[0]).toMatchObject({
      result: 'short',
      metadata: { trimmed: true },
    })
  })

  it('removes the metadata when replaceResult metadata is empty', async () => {
    const results = await run([call('tc-1', 'tag')], [tagTool], {
      onAfterToolCall: async () => ({
        type: 'replaceResult',
        result: 'short',
        metadata: {},
      }),
    })

    expect(results[0]?.metadata).toBeUndefined()
  })

  it('gives a skipped call the metadata of the skip decision', async () => {
    const results = await run([call('tc-1', 'tag')], [tagTool], {
      onBeforeToolCall: async () => ({
        type: 'skip',
        result: 'cached',
        metadata: { source: 'cache' },
      }),
    })

    expect(results[0]).toMatchObject({
      result: 'cached',
      metadata: { source: 'cache' },
    })
  })
})

describe('ToolCallManager.executeTools result metadata', () => {
  it('puts the metadata on the tool message', async () => {
    const manager = new ToolCallManager<Record<string, never>>([tagTool])
    manager.addToolCallStartEvent(ev.toolStart('tc-1', 'tag'))
    manager.addToolCallArgsEvent(ev.toolArgs('tc-1', '{}'))

    const generator = manager.executeTools(ev.runFinished('tool_calls'), {})
    let next = await generator.next()
    while (!next.done) next = await generator.next()

    expect(next.value[0]).toMatchObject({
      role: 'tool',
      toolCallId: 'tc-1',
      metadata: { a: 1 },
    })
  })
})
