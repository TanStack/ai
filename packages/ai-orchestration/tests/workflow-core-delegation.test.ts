import { inMemoryRunStore as workflowCoreInMemoryRunStore } from '@tanstack/workflow-core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { approve, defineAgent, defineWorkflow, runWorkflow } from '../src'
import { collect, findRunId } from './test-utils'

describe('workflow-core delegation', () => {
  it('runs on the workflow-core run store contract', async () => {
    const echo = defineAgent({
      name: 'echo',
      input: z.object({ msg: z.string() }),
      output: z.object({ echoed: z.string() }),
      run: async ({ input }) => ({ echoed: input.msg.toUpperCase() }),
    })

    const workflow = defineWorkflow({
      name: 'core-backed',
      input: z.object({ msg: z.string() }),
      output: z.object({ echoed: z.string() }),
      state: z.object({}).default({}),
      agents: { echo },
      run: async function* ({ input, agents }) {
        const result = yield* agents.echo({ msg: input.msg })
        yield* approve({ title: 'continue?' })
        return result
      },
    })

    const runStore = workflowCoreInMemoryRunStore()
    const events = await collect(
      runWorkflow({
        workflow,
        input: { msg: 'hello' },
        runStore,
      }),
    )

    const runId = findRunId(events)
    const persistedEvents = await runStore.getEvents(runId)

    expect(
      events.find((event) => event.type === 'RUN_FINISHED'),
    ).toBeUndefined()
    expect(
      persistedEvents.some((event) => event.type === 'STEP_FINISHED'),
    ).toBe(true)
  })
})
