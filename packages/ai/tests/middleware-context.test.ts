import { describe, expect, it } from 'vitest'
import { chat, toolDefinition } from '../src'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { ChatMiddleware } from '../src'

describe('middleware runtime context', () => {
  it('passes the same runtime context to middleware and server tools', async () => {
    type AppContext = { userId: string; marker: object }
    const context: AppContext = { userId: 'u-1', marker: {} }
    const seen: Array<AppContext> = []

    const tool = toolDefinition({
      name: 'read_context',
      description: 'Read context',
    }).server<AppContext>((_input, ctx) => {
      seen.push(ctx.context)
      return { userId: ctx.context.userId }
    })

    const middleware: ChatMiddleware<AppContext> = {
      onStart(ctx) {
        seen.push(ctx.context)
      },
    }

    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.toolStart('tc-1', 'read_context'),
          ev.toolArgs('tc-1', '{}'),
          ev.runFinished('tool_calls'),
        ],
        [ev.textContent('done'), ev.runFinished('stop')],
      ],
    })

    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hello' }],
        tools: [tool],
        middleware: [middleware],
        context,
      }),
    )

    expect(seen[0]).toBe(context)
    expect(seen[1]).toBe(context)
  })

  it('allows server tools with optional context to run without runtime context', async () => {
    const seen: Array<unknown> = []

    const tool = toolDefinition({
      name: 'optional_context',
      description: 'Read optional context',
    }).server<{ userId: string } | undefined>((_input, ctx) => {
      seen.push(ctx?.context)
      return { ok: true }
    })

    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.toolStart('tc-1', 'optional_context'),
          ev.toolArgs('tc-1', '{}'),
          ev.runFinished('tool_calls'),
        ],
        [ev.textContent('done'), ev.runFinished('stop')],
      ],
    })

    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hello' }],
        tools: [tool],
      }),
    )

    expect(seen).toEqual([undefined])
  })
})
