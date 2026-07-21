import { expectTypeOf } from 'vitest'
import { createWorkflow } from '@tanstack/workflow-core'
import { z } from 'zod'
import { agentMiddleware, defineAgent } from '../src'
import type { AgentOutput } from '../src'

const writer = defineAgent({
  name: 'writer',
  input: z.object({ topic: z.string() }),
  output: z.object({ article: z.string() }),
  run: async ({ input }) => ({ article: input.topic }),
})

const workflow = createWorkflow({ id: 'typed' })
  .middleware([agentMiddleware()])
  .handler(async (ctx) => {
    const result = await ctx.ai.agent('draft', writer, { topic: 'Workflow' })
    expectTypeOf(result).toEqualTypeOf<{ article: string }>()

    // @ts-expect-error the agent input schema requires topic
    await ctx.ai.agent('invalid', writer, { subject: 'Workflow' })

    return result
  })

expectTypeOf(workflow.id).toEqualTypeOf<string>()

const textAgent = defineAgent({
  name: 'text',
  run: async () => 'done',
})

expectTypeOf<AgentOutput<typeof textAgent>>().toEqualTypeOf<string>()
