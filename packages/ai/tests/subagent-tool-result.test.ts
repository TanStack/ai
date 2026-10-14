import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat'
import {
  defineAgent,
  type DefinedAgent,
} from '../src/activities/chat/agents/define-agent'
import { EventType, type StreamChunk } from '../src/types'
import { collectChunks, createMockAdapter, ev } from './test-utils'

function textAgent(text: string): DefinedAgent {
  const adapter = createMockAdapter({
    iterations: [
      [
        ev.runStarted('child-run', 'child-thread'),
        ev.textStart('child-message'),
        ev.textContent(text, 'child-message'),
        ev.textEnd('child-message'),
        ev.runFinished('stop', 'child-run', undefined, 'child-thread'),
      ],
    ],
  }).adapter

  return defineAgent({
    name: 'researcher',
    description: 'Looks up facts',
    run(ctx) {
      return chat({
        adapter,
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
      })
    },
  })
}

async function runSyntheticTool(agent: DefinedAgent) {
  const { adapter, calls } = createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ev.toolStart('call-1', 'researcher'),
        ev.toolArgs('call-1', '{}'),
        ev.runFinished('tool_calls'),
      ],
      [ev.runStarted(), ev.runFinished('stop')],
    ],
  })
  const chunks = await collectChunks(
    chat({
      adapter,
      messages: [{ role: 'user', content: 'Research this' }],
      subagents: { agents: [agent] },
    }) as AsyncIterable<StreamChunk>,
  )

  return {
    result: chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_RESULT),
    modelToolMessage: calls[1]?.messages.find(
      (message) => message.role === 'tool',
    ),
  }
}

describe('synthetic subagent tool result', () => {
  it('keeps the internal run id out of the result content', async () => {
    const { result, modelToolMessage } = await runSyntheticTool(
      textAgent('Found it'),
    )
    const expected = JSON.stringify({ result: 'Found it' })

    expect(result).toMatchObject({ content: expected })
    expect(modelToolMessage?.content).toBe(expected)
  })

  it('keeps the internal run id out of error content', async () => {
    const agent = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      run: async function* () {
        throw new Error('Research failed')
      },
    })
    const { result, modelToolMessage } = await runSyntheticTool(agent)
    const expected = JSON.stringify({ error: 'Research failed' })

    expect(result).toMatchObject({ content: expected })
    expect(modelToolMessage?.content).toBe(expected)
  })
})
