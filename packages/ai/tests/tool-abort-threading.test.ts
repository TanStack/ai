// packages/ai/tests/tool-abort-threading.test.ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { executeToolCalls } from '../src/activities/chat/tools/tool-calls'
import { toolDefinition } from '../src'

describe('executeToolCalls abort threading', () => {
  it('forwards an AbortSignal to server tool execute via context', async () => {
    const controller = new AbortController()
    let seen: AbortSignal | undefined
    const tool = toolDefinition({
      name: 'probe',
      description: 'probe tool',
      inputSchema: z.object({}),
    }).server((_args, ctx) => {
      seen = ctx?.abortSignal
      return 'ok'
    })
    const calls = [
      {
        id: 'c1',
        type: 'function',
        function: { name: 'probe', arguments: '{}' },
      },
    ]
    const gen = executeToolCalls(
      calls as any,
      [tool],
      new Map(),
      new Map(),
      undefined,
      undefined,
      undefined,
      controller.signal, // new trailing param
    )
    // drain
    while (!(await gen.next()).done) {
      /* consume events */
    }
    expect(seen).toBe(controller.signal)
  })
})
