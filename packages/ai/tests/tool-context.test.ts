import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '../src'

describe('tool runtime context', () => {
  it('passes typed runtime context to server tool execute function', async () => {
    type AppContext = { userId: string; dbName: string }

    const tool = toolDefinition({
      name: 'getContextValue',
      description: 'Read context',
      inputSchema: z.object({ key: z.string() }),
      outputSchema: z.object({ value: z.string() }),
    })

    const serverTool = tool.server<AppContext>((_input, ctx) => ({
      value: `${ctx.context.userId}:${ctx.context.dbName}`,
    }))

    if (!serverTool.execute) {
      throw new Error('Expected server tool execute function')
    }

    await expect(
      Promise.resolve(
        serverTool.execute(
          { key: 'userId' },
          {
            toolCallId: 'tc-1',
            context: { userId: 'user-1', dbName: 'primary' },
            emitCustomEvent: () => {},
          },
        ),
      ),
    ).resolves.toEqual({ value: 'user-1:primary' })
  })
})
