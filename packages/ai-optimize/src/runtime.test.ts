import { describe, expect, it } from 'vitest'
import { createContextRuntime } from './runtime'
import { optimize } from './optimize'
import {
  truncateHead,
  truncateHeadTail,
  dropWithRef,
  aboveTokens,
} from './builders'
import {
  at,
  callTool,
  must,
  runConfig,
  stubConfig,
  stubCtx,
} from './test-helpers'
import type { ModelMessage, Tool } from '@tanstack/ai'

const big = 'H'.repeat(4000) + 'T'.repeat(4000)
const ctx = stubCtx()

function assistantCall(id: string, name: string, args = '{}'): ModelMessage {
  return {
    role: 'assistant',
    content: '',
    toolCalls: [{ id, type: 'function', function: { name, arguments: args } }],
  }
}
function toolResult(id: string, name: string, output: unknown): ModelMessage {
  return { role: 'tool', toolCallId: id, name, content: JSON.stringify(output) }
}

const optimizedReadFile: Tool = {
  name: 'read_file',
  description: 'read',
  context: { result: { fields: { content: truncateHeadTail() } } },
}

describe('createContextRuntime middleware (author-optimized)', () => {
  it('projects the tool result into providerMessages; canonical messages untouched', () => {
    const runtime = createContextRuntime()
    const messages = [
      assistantCall('call1', 'read_file'),
      toolResult('call1', 'read_file', { content: big }),
    ]
    const originalContent = at(messages, 1).content
    const out = must(
      runConfig(
        runtime.middleware,
        ctx,
        stubConfig(messages, [optimizedReadFile]),
      ),
    )

    const projected = JSON.parse(at(out.providerMessages, 1).content as string)
    expect(
      projected.content.startsWith('[Truncated for context: content,'),
    ).toBe(true)
    // Canonical messages never mutated.
    expect(at(messages, 1).content).toBe(originalContent)
    expect(at(out.providerMessages, 1)).not.toBe(at(messages, 1))
  })

  it('retrieve_context returns the original field value', async () => {
    const runtime = createContextRuntime()
    const messages = [
      assistantCall('call1', 'read_file'),
      toolResult('call1', 'read_file', { content: big }),
    ]
    runConfig(
      runtime.middleware,
      ctx,
      stubConfig(messages, [optimizedReadFile]),
    )
    const retrieved = await callTool(runtime.retrieveTool, {
      ref: 'ctx_call1_result_content',
    })
    expect(retrieved).toBe(big)
  })

  it('unknown ref errors (exempt from projection as an error result)', async () => {
    const runtime = createContextRuntime()
    await expect(
      callTool(runtime.retrieveTool, { ref: 'ctx_nope_root' }),
    ).rejects.toThrow(/Unknown context ref/)
  })

  it('prefix stability: projecting twice yields identical providerMessages', () => {
    const runtime = createContextRuntime()
    const messages = [
      assistantCall('call1', 'read_file'),
      toolResult('call1', 'read_file', { content: big }),
    ]
    const a = must(
      runConfig(
        runtime.middleware,
        ctx,
        stubConfig(messages, [optimizedReadFile]),
      ),
    )
    const b = must(
      runConfig(
        runtime.middleware,
        ctx,
        stubConfig(messages, [optimizedReadFile]),
      ),
    )
    expect(JSON.stringify(a.providerMessages)).toBe(
      JSON.stringify(b.providerMessages),
    )
  })

  it('skips the init phase', () => {
    const runtime = createContextRuntime()
    const messages = [
      assistantCall('call1', 'read_file'),
      toolResult('call1', 'read_file', { content: big }),
    ]
    const out = runConfig(
      runtime.middleware,
      stubCtx('init'),
      stubConfig(messages, [optimizedReadFile]),
    )
    expect(out).toBeUndefined()
  })

  it('emits one event per projected field via onEvent (deduped across iterations)', () => {
    const events: Array<unknown> = []
    const runtime = createContextRuntime({ onEvent: (e) => events.push(e) })
    const messages = [
      assistantCall('call1', 'read_file'),
      toolResult('call1', 'read_file', { content: big }),
    ]
    runConfig(
      runtime.middleware,
      ctx,
      stubConfig(messages, [optimizedReadFile]),
    )
    runConfig(
      runtime.middleware,
      ctx,
      stubConfig(messages, [optimizedReadFile]),
    )
    expect(events).toHaveLength(1)
  })
})

describe('optimize() middleware (consumer / MCP)', () => {
  it('projects foreign tool results via universal defaults, reading providerMessages when set', () => {
    const foreign: Tool = { name: 'fetch_page', description: 'fetch' }
    const opt = optimize([foreign], {
      defaults: {
        projection: aboveTokens(1500, truncateHeadTail({ maxTokens: 750 })),
        mode: 'leaves',
      },
    })
    const messages = [
      assistantCall('c', 'fetch_page'),
      toolResult('c', 'fetch_page', { body: big }),
    ]
    // Simulate a prior middleware having set providerMessages == messages.
    const out = must(
      runConfig(
        opt.middleware,
        ctx,
        stubConfig(messages, [foreign], { providerMessages: messages }),
      ),
    )
    const projected = JSON.parse(at(out.providerMessages, 1).content as string)
    expect(projected.body.startsWith('[Truncated')).toBe(true)
  })

  it('needsApproval tools: args projection is forbidden (history stays honest)', () => {
    const writeFile: Tool = {
      name: 'write_file',
      description: 'write',
      needsApproval: true,
    }
    const opt = optimize([writeFile], {
      tools: { write_file: { args: { fields: { content: dropWithRef() } } } },
    })
    const argsJson = JSON.stringify({ content: big, path: '/f' })
    const messages = [
      assistantCall('c', 'write_file', argsJson),
      toolResult('c', 'write_file', { ok: true }),
    ]
    const out = runConfig(
      opt.middleware,
      ctx,
      stubConfig(messages, [writeFile]),
    )
    // No args projection → nothing changed → undefined (providerMessages untouched).
    expect(out).toBeUndefined()
  })

  it('completed-call args ARE projected for non-approval tools', () => {
    const writeFile: Tool = { name: 'write_file', description: 'write' }
    const opt = optimize([writeFile], {
      tools: { write_file: { args: { fields: { content: dropWithRef() } } } },
    })
    const argsJson = JSON.stringify({ content: big, path: '/f' })
    const messages = [
      assistantCall('c', 'write_file', argsJson),
      toolResult('c', 'write_file', { ok: true }),
    ]
    const out = must(
      runConfig(opt.middleware, ctx, stubConfig(messages, [writeFile])),
    )
    const projectedArgs = JSON.parse(
      at(must(at(out.providerMessages, 0).toolCalls), 0).function.arguments,
    )
    expect(projectedArgs.path).toBe('/f')
    expect(
      projectedArgs.content.startsWith('[Dropped for context: content,'),
    ).toBe(true)
  })

  it('args and result projections on the same field do not collide in the stash', async () => {
    const writeFile: Tool = { name: 'write_file', description: 'write' }
    const opt = optimize([writeFile], {
      tools: {
        write_file: {
          args: { fields: { content: dropWithRef() } },
          result: { fields: { content: truncateHeadTail() } },
        },
      },
    })
    const argContent = 'A'.repeat(8000)
    const resultContent = 'R'.repeat(8000)
    const messages = [
      assistantCall('c', 'write_file', JSON.stringify({ content: argContent })),
      toolResult('c', 'write_file', { content: resultContent }),
    ]
    runConfig(opt.middleware, ctx, stubConfig(messages, opt.tools))
    const retrieveTool = must(
      opt.tools.find((t) => t.name === 'retrieve_context'),
    )
    // Distinct refs: the args original and the result original are both intact.
    const fromArgs = await callTool(retrieveTool, { ref: 'ctx_c_args_content' })
    const fromResult = await callTool(retrieveTool, {
      ref: 'ctx_c_result_content',
    })
    expect(fromArgs).toBe(argContent)
    expect(fromResult).toBe(resultContent)
  })

  it('onStart clears per-run state so a reused runtime does not leak', async () => {
    const runtime = createContextRuntime()
    const messages = [
      assistantCall('call1', 'read_file'),
      toolResult('call1', 'read_file', { content: big }),
    ]
    runConfig(
      runtime.middleware,
      ctx,
      stubConfig(messages, [optimizedReadFile]),
    )
    expect(runtime.stash.size).toBe(1)
    await runtime.middleware.onStart?.(stubCtx())
    expect(runtime.stash.size).toBe(0)
    await expect(
      callTool(runtime.retrieveTool, { ref: 'ctx_call1_result_content' }),
    ).rejects.toThrow(/Unknown context ref/)
  })

  it('pending (no result yet) calls are not args-projected', () => {
    const writeFile: Tool = { name: 'write_file', description: 'write' }
    const opt = optimize([writeFile], {
      tools: { write_file: { args: { fields: { content: dropWithRef() } } } },
    })
    const argsJson = JSON.stringify({ content: big, path: '/f' })
    // No tool-result message → the call has not completed.
    const messages = [assistantCall('c', 'write_file', argsJson)]
    const out = runConfig(
      opt.middleware,
      ctx,
      stubConfig(messages, [writeFile]),
    )
    expect(out).toBeUndefined()
  })
})

describe('optimize() tool-set shaping', () => {
  it('appends retrieve_context when a rule is retrievable, and clones inputs', () => {
    const foreign: Tool = { name: 'fetch_page', description: 'fetch' }
    const opt = optimize([foreign], {
      defaults: { projection: truncateHeadTail() },
    })
    expect(opt.tools.map((t) => t.name)).toContain('retrieve_context')
    expect(at(opt.tools, 0)).not.toBe(foreign) // copy, not the caller's object
  })

  it('does not append retrieve_context when nothing is retrievable', () => {
    const foreign: Tool = { name: 'fetch_page', description: 'fetch' }
    const opt = optimize([foreign], {
      tools: {
        fetch_page: {
          result: { fields: { body: truncateHead({ retrievable: false }) } },
        },
      },
    })
    expect(opt.tools.map((t) => t.name)).not.toContain('retrieve_context')
  })
})
