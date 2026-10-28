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
        threadId: 'thread-1',
        toolCallId: 't1',
        emitCustomEvent: () => {},
        abortSignal: controller.signal,
      },
    )
    expect(seen).toBe(controller.signal)
  })
})

describe('ToolExecutionContext.detach', () => {
  it('lets a tool return the note when the host moves its work', async () => {
    let finish: (value: string) => void = () => {}
    const work = new Promise<string>((resolve) => {
      finish = resolve
    })
    let moved: Promise<unknown> | undefined
    const tool = toolDefinition({
      name: 'build',
      description: 'Run a long build',
      inputSchema: z.object({}),
    }).server((_args, ctx) =>
      ctx?.detach ? Promise.race([work, ctx.detach(work)]) : work,
    )

    const result = await tool.execute!(
      {},
      {
        threadId: 'thread-1',
        toolCallId: 't1',
        emitCustomEvent: () => {},
        detach: (job) => {
          moved = job
          return Promise.resolve('Moved to the background.')
        },
      },
    )

    expect(result).toBe('Moved to the background.')
    // The host keeps the work, and it still ends.
    finish('built')
    await expect(moved).resolves.toBe('built')
  })
})
