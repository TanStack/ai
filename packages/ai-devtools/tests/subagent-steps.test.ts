import { describe, expect, it } from 'vitest'
import {
  buildSubagentSteps,
  collectServerSteps,
  collectSubagents,
  groupTimeline,
  snapshotTurns,
  subagentIdForRunId,
} from '../src/store/subagent-steps'
import type { Iteration, Message } from '../src/store/ai-context'

const researcherMessages = [
  {
    id: 'child-1',
    role: 'assistant',
    parts: [
      { type: 'thinking', content: 'Look up the facts first.' },
      {
        type: 'tool-call',
        id: 'call_1',
        name: 'lookupFacts',
        arguments: '{"topic":"squids"}',
        state: 'complete',
        output: { facts: ['three hearts'] },
      },
      {
        type: 'tool-result',
        toolCallId: 'call_1',
        content: '{"facts":["three hearts"]}',
        state: 'complete',
      },
      { type: 'text', content: 'Squids have three hearts.' },
    ],
  },
]

const snapshot = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', content: 'hi' }] },
  { id: 'a1', role: 'assistant', parts: [{ type: 'text', content: 'hello' }] },
  { id: 'u2', role: 'user', parts: [{ type: 'text', content: 'research' }] },
  {
    id: 'a2',
    role: 'assistant',
    parts: [
      {
        type: 'subagent',
        subagent: {
          id: 'sub-1',
          name: 'researcher',
          status: 'finished',
          messages: [
            ...researcherMessages,
            {
              id: 'child-2',
              role: 'assistant',
              parts: [
                {
                  type: 'subagent',
                  subagent: {
                    id: 'sub-2',
                    name: 'checker',
                    status: 'error',
                    error: { message: 'boom' },
                    messages: [],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  },
]

describe('collectSubagents', () => {
  it('lists every child with its path and turn', () => {
    const agents = collectSubagents(snapshot)
    expect(agents.map((a) => [a.id, a.path, a.status, a.turn])).toEqual([
      ['sub-1', 'researcher', 'finished', 1],
      ['sub-2', 'researcher > checker', 'error', 1],
    ])
    expect(agents[1]?.error).toBe('boom')
  })
})

describe('subagentIdForRunId', () => {
  const ids = new Set(['sub-1', 'sub-2'])
  it('matches the child run id suffix', () => {
    expect(subagentIdForRunId('run-9:sub-1', ids)).toBe('sub-1')
    expect(subagentIdForRunId('run-9:sub-1:sub-2', ids)).toBe('sub-2')
    expect(subagentIdForRunId('sub-2', ids)).toBe('sub-2')
  })
  it('ignores the parent run and unknown runs', () => {
    expect(subagentIdForRunId('run-9', ids)).toBeUndefined()
    expect(subagentIdForRunId('run-9:other', ids)).toBeUndefined()
    expect(subagentIdForRunId(undefined, ids)).toBeUndefined()
  })
})

function iteration(
  requestId: string,
  runId: string,
  index: number,
  startedAt: number,
): Iteration {
  return {
    requestId,
    runId,
    index,
    messageId: `${requestId}-${index}`,
    startedAt,
    completedAt: startedAt + 1,
    middlewareEvents: [],
    messageIds: [`${requestId}-${index}`],
  }
}

function user(id: string, timestamp: number, requestId: string): Message {
  return { id, role: 'user', content: id, timestamp, requestId }
}

describe('groupTimeline', () => {
  const agents = collectSubagents(snapshot)

  it('moves child server steps under their agent and drops child user copies', () => {
    const iterations = [
      iteration('root-1', 'run-1', 0, 10),
      iteration('root-2', 'run-2', 0, 30),
      iteration('child-a', 'run-2:sub-1', 0, 31),
      iteration('child-a', 'run-2:sub-1', 1, 32),
    ]
    const messages = [
      user('u1', 5, 'root-1'),
      user('u2', 25, 'root-2'),
      // The child request re-sends the history. These are not new turns.
      user('u1-copy', 31, 'child-a'),
      user('u2-copy', 31, 'child-a'),
    ]
    const groups = groupTimeline(iterations, messages, agents)

    expect(groups.map((g) => g.userMessage?.id)).toEqual(['u1', 'u2'])
    expect(groups[0]?.agents).toEqual([])
    expect(groups[1]?.iterations.map((i) => i.requestId)).toEqual(['root-2'])

    const [researcher, checker] = groups[1]?.agents ?? []
    expect(researcher?.agent.path).toBe('researcher')
    expect(researcher?.source).toBe('server')
    expect(researcher?.iterations.map((i) => i.index)).toEqual([0, 1])
    // No server steps for this child, so they come from the snapshot.
    expect(checker?.agent.path).toBe('researcher > checker')
    expect(checker?.source).toBe('snapshot')
  })

  it('keeps a turn that only has child steps', () => {
    const groups = groupTimeline(
      [iteration('child-a', 'run-2:sub-1', 0, 31)],
      [user('u1', 5, 'root-1'), user('u2', 25, 'root-2')],
      agents,
    )
    expect(groups.map((g) => g.userMessage?.id)).toEqual(['u2'])
    expect(groups[0]?.iterations).toEqual([])
    expect(groups[0]?.agents.map((g) => g.agent.id)).toEqual(['sub-1', 'sub-2'])
  })
})

describe('turns from the snapshot', () => {
  const agents = collectSubagents(snapshot)

  it('keeps a routed turn that has no parent server steps', () => {
    // Turn 1 went to the researcher. Only turn 2 ran the parent model.
    const turns = snapshotTurns([
      {
        id: 'u1',
        role: 'user',
        createdAt: new Date(10),
        parts: [{ type: 'text', content: 'research' }],
      },
      { id: 'a1', role: 'assistant', parts: [] },
      {
        id: 'u2',
        role: 'user',
        createdAt: '1970-01-01T00:00:00.030Z',
        parts: [{ type: 'text', content: 'what is 2 + 2' }],
      },
    ])
    expect(turns.map((t) => [t.id, t.content, t.timestamp])).toEqual([
      ['u1', 'research', 10],
      ['u2', 'what is 2 + 2', 30],
    ])
    const researcher = agents.filter((agent) => agent.id === 'sub-1')
    const groups = groupTimeline(
      [iteration('root-2', 'run-2', 0, 31)],
      // The server conversation only knows turn 2.
      [user('u2-server', 31, 'root-2')],
      researcher.map((agent) => ({ ...agent, turn: 0 })),
      turns,
    )
    expect(groups.map((g) => g.userMessage?.id)).toEqual(['u1', 'u2'])
    expect(groups[0]?.agents.map((g) => g.agent.id)).toEqual(['sub-1'])
    expect(groups[1]?.iterations.map((i) => i.requestId)).toEqual(['root-2'])
  })

  it('returns no turns when a user message has no createdAt', () => {
    expect(snapshotTurns([{ id: 'u1', role: 'user', parts: [] }])).toEqual([])
  })
})

describe('collectServerSteps', () => {
  it('pulls child steps from the child thread conversation', () => {
    const agents = collectSubagents(snapshot)
    const root = {
      iterations: [iteration('root-2', 'run-2', 0, 30)],
      messages: [user('u2', 29, 'root-2')],
    }
    const childThread = {
      iterations: [iteration('child-a', 'run-1:sub-1', 0, 11)],
      messages: [
        {
          id: 'child-msg',
          role: 'assistant' as const,
          content: 'notes',
          timestamp: 11,
        },
      ],
    }
    const other = {
      iterations: [iteration('x', 'run-9', 0, 5)],
      messages: [user('other', 5, 'x')],
    }
    const steps = collectServerSteps(root, [root, childThread, other], agents)
    expect(steps.iterations.map((i) => i.requestId)).toEqual([
      'root-2',
      'child-a',
    ])
    expect(steps.messages.map((m) => m.id)).toEqual(['u2', 'child-msg'])
  })
})

describe('buildSubagentSteps', () => {
  it('ends a step after its tool results', () => {
    const agent = collectSubagents(snapshot)[0]
    if (!agent) throw new Error('no agent')
    const { iterations, messages } = buildSubagentSteps(agent)

    expect(iterations).toHaveLength(2)
    expect(iterations[0]?.finishReason).toBe('tool_calls')
    expect(iterations[1]?.finishReason).toBe('stop')

    const first = messages.find((m) => m.id === iterations[0]?.messageId)
    expect(first?.thinkingContent).toBe('Look up the facts first.')
    expect(first?.toolCalls?.[0]).toMatchObject({
      name: 'lookupFacts',
      result: { facts: ['three hearts'] },
    })
    const result = messages.find(
      (m) => m.role === 'tool' && iterations[0]?.messageIds.includes(m.id),
    )
    expect(result?.content).toBe('{"facts":["three hearts"]}')

    const second = messages.find((m) => m.id === iterations[1]?.messageId)
    expect(second?.content).toBe('Squids have three hearts.')
  })

  it('keeps parallel tool results in one step', () => {
    const { iterations } = buildSubagentSteps({
      id: 'sub-3',
      name: 'x',
      path: 'x',
      turn: 0,
      status: 'running',
      messages: [
        {
          role: 'assistant',
          parts: [
            { type: 'tool-call', id: 'a', name: 'one', arguments: '{}' },
            { type: 'tool-call', id: 'b', name: 'two', arguments: '{}' },
            { type: 'tool-result', toolCallId: 'a', content: '1' },
            { type: 'tool-result', toolCallId: 'b', content: '2' },
          ],
        },
      ],
    })
    expect(iterations).toHaveLength(1)
    expect(iterations[0]?.messageIds).toHaveLength(3)
    // A running child's last step is still open.
    expect(iterations[0]?.completedAt).toBeUndefined()
  })
})
