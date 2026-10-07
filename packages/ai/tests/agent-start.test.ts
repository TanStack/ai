import { describe, expect, it } from 'vitest'
import { EventType } from '../src/types'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { spawnAgentStream } from '../src/activities/chat/agents/spawn'
import type { AgentStarter } from '../src/activities/chat/agents/bound'
import type { SubagentRunInput } from '../src/activities/chat/agents/define-agent'
import type { StreamChunk } from '../src/types'

const input: SubagentRunInput = {
  input: undefined,
  messages: [],
  threadId: 't',
  runId: 'r',
  parentRunId: 'p',
  subagentRunId: 's',
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('ctx.agents of an agent run', () => {
  it('throws a clear error when no host binds it', async () => {
    const agent = defineAgent({
      name: 'lead',
      description: 'Starts a helper',
      run: async (ctx) => ctx.agents.start('helper'),
    })

    const chunks = await collect(spawnAgentStream(agent, input))

    expect(
      chunks.find((chunk) => chunk.type === EventType.SUBAGENT_ERROR),
    ).toMatchObject({
      message: expect.stringContaining('ctx.agents.start needs a host'),
    })
  })

  it('starts agents through the agents of the host binding', async () => {
    const started: Array<unknown> = []
    const agents: AgentStarter = {
      start: (agent, childInput, options) => {
        started.push({ agent, input: childInput, options })
        return Object.assign(Promise.resolve('helped'), {
          id: 'op-helper',
          send: async () => undefined,
          cancel: async () => undefined,
        })
      },
    }
    const agent = defineAgent({
      name: 'lead',
      description: 'Starts a helper',
      run: async (ctx) => {
        const child = ctx.agents.start(
          'helper',
          { topic: 'tea' },
          { wake: true },
        )
        return { id: child.id, result: await child }
      },
    })

    const chunks = await collect(
      spawnAgentStream(agent, input, undefined, undefined, { agents }),
    )

    expect(started).toEqual([
      { agent: 'helper', input: { topic: 'tea' }, options: { wake: true } },
    ])
    expect(
      chunks.find((chunk) => chunk.type === EventType.SUBAGENT_FINISHED),
    ).toMatchObject({ result: { id: 'op-helper', result: 'helped' } })
  })
})
