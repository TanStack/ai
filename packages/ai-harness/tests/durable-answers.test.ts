import { describe, expect, it } from 'vitest'
import { durableAnswers } from '../src/boundary-waits'
import type { ModelMessage } from '@tanstack/ai'

function memoryState() {
  let value: Record<string, unknown> = {}
  return {
    read: () => value,
    state: <T>(initial: T) => {
      value = initial as Record<string, unknown>
      return {
        get: async () => value as T,
        update: async (change: (current: T) => T) => {
          value = change(value as T) as Record<string, unknown>
          return value as T
        },
      }
    },
  }
}

const callTurn = (id: string, text: string): Array<ModelMessage> => [
  { role: 'user', content: text },
  {
    role: 'assistant',
    content: null,
    toolCalls: [
      {
        id,
        type: 'function',
        function: { name: 'delete_file', arguments: JSON.stringify({ text }) },
      },
    ],
  },
]

describe('durableAnswers', () => {
  it('keeps the answer of a pending call across pauses until it is taken', async () => {
    const memory = memoryState()
    const answers = durableAnswers(memory).forRun(undefined)
    const messages = callTurn('call_0', 'a')
    await answers.setMany(messages, [['call_0', 'call_0', true]])

    await answers.retain(messages, ['call_0'])

    expect(await answers.has('call_0')).toBe(true)
    expect(await answers.take(['call_0'])).toEqual({
      present: ['call_0'],
      values: [true],
    })
    expect(memory.read()).toEqual({})
  })

  it('drops the answer of a call that never ran when the next turn starts', async () => {
    const memory = memoryState()
    const answers = durableAnswers(memory).forRun(undefined)
    const first = callTurn('call_1', 'a')
    await answers.setMany(first, [['call_1', 'call_1', true]])

    const next = [...first, ...callTurn('call_2', 'b')]
    await answers.retain(next, ['call_2'])

    expect(memory.read()).toEqual({})
  })

  it('does not approve a later call that reuses the id of an approved call', async () => {
    const answers = durableAnswers(memoryState()).forRun(undefined)
    const first = callTurn('call_0', 'notes.txt')
    await answers.setMany(first, [['call_0', 'call_0', true]])

    // The approved call never ran, and the model reuses its id.
    const next = [...first, ...callTurn('call_0', 'passwords.txt')]
    await answers.retain(next, ['call_0'])

    expect(await answers.has('call_0')).toBe(false)
    expect((await answers.take(['call_0'])).present).toEqual([])
  })

  it('keeps the answers of another run', async () => {
    const store = durableAnswers(memoryState())
    const other = store.forRun('agent-1')
    await other.setMany(callTurn('call_other', 'a'), [
      ['call_other', 'call_other', true],
    ])

    // The lead turn's transcript does not have the agent's call.
    await store
      .forRun(undefined)
      .retain(callTurn('call_mine', 'b'), ['call_mine'])

    expect(await other.has('call_other')).toBe(true)
  })

  it('does not approve the call of a parallel run that has the same id', async () => {
    const store = durableAnswers(memoryState())
    const lead = store.forRun(undefined)
    const agent = store.forRun('agent-1')
    const leadTurn = callTurn('call_0', 'notes.txt')
    const agentTurn = callTurn('call_0', 'passwords.txt')
    await lead.setMany(leadTurn, [['call_0', 'call_0', true]])

    await agent.retain(agentTurn, ['call_0'])

    expect(await agent.has('call_0')).toBe(false)
    expect((await agent.take(['call_0'])).present).toEqual([])
    expect(await lead.has('call_0')).toBe(true)
  })

  it('stores the answer of a call with the id __proto__', async () => {
    const answers = durableAnswers(memoryState()).forRun(undefined)
    const messages = callTurn('__proto__', 'a')
    await answers.setMany(messages, [['__proto__', '__proto__', true]])

    await answers.retain(messages, ['__proto__'])

    expect(await answers.has('__proto__')).toBe(true)
    expect((await answers.take(['__proto__'])).values).toEqual([true])
  })
})
