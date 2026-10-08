import { describe, expect, it } from 'vitest'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { spawnAgentStream } from '../src/activities/chat/agents/spawn'
import type { AgentStep } from '../src/activities/chat/agents/bound'
import type { SubagentRunInput } from '../src/activities/chat/agents/define-agent'

const input: SubagentRunInput = {
  input: undefined,
  messages: [],
  threadId: 't',
  runId: 'r',
  parentRunId: 'p',
  subagentRunId: 's',
}

async function drain(stream: AsyncIterable<unknown>) {
  for await (const _chunk of stream) {
    // Run the agent to its end.
  }
}

describe('ctx.step of an agent run', () => {
  it('runs fn each time when no host gives steps', async () => {
    let runs = 0
    const agent = defineAgent({
      name: 'counter',
      description: 'Counts',
      run: async (ctx) => ctx.step.do('count', () => (runs += 1)),
    })

    await drain(spawnAgentStream(agent, input))
    await drain(spawnAgentStream(agent, input))

    expect(runs).toBe(2)
  })

  it('uses the steps of the host binding', async () => {
    const names: Array<string> = []
    const step: AgentStep = {
      do: async <T>(name: string) => {
        names.push(name)
        return 'stored' as T
      },
    }
    let ran = false
    let value: unknown
    const agent = defineAgent({
      name: 'charger',
      description: 'Charges once',
      run: async (ctx) => {
        value = await ctx.step.do('charge', () => {
          ran = true
          return 'fresh'
        })
        return value
      },
    })

    await drain(spawnAgentStream(agent, input, undefined, undefined, { step }))

    expect(names).toEqual(['charge'])
    expect(ran).toBe(false)
    expect(value).toBe('stored')
  })
})
