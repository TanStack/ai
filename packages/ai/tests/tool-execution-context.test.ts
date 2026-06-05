// packages/ai/tests/tool-execution-context.test.ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '../src'

describe('ToolExecutionContext.abortSignal', () => {
  it('passes the abort signal into a server tool execute', async () => {
    const controller = new AbortController()
    let seen: AbortSignal | undefined
    const tool = toolDefinition({
      name: 'echo',
      description: 'Echo a value',
      inputSchema: z.object({ v: z.string() }),
    }).server((args, ctx) => {
      seen = ctx?.abortSignal
      return args.v
    })
    // Invoke execute directly with a context to assert the field is typed + forwarded.
    await tool.execute!(
      { v: 'hi' },
      {
        toolCallId: 't1',
        emitCustomEvent: () => {},
        abortSignal: controller.signal,
      },
    )
    expect(seen).toBe(controller.signal)
  })
})
