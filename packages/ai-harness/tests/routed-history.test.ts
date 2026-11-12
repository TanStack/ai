import { describe, expect, it } from 'vitest'
import { historyFor, routedHistoryMiddleware } from '../src/routed-history'
import type { ModelMessage } from '@tanstack/ai'

type Child = { name: string; subagentRunId: string }

const CHILDREN: Record<string, Array<Child>> = {
  r1: [{ name: 'billing', subagentRunId: 's1' }],
  r2: [{ name: 'research', subagentRunId: 's2' }],
}

const BILLING_TRANSCRIPT: Array<ModelMessage> = [
  { id: 'task1', role: 'user', content: 'Refund order 42' },
  {
    id: 'b1',
    role: 'assistant',
    content: null,
    toolCalls: [
      {
        id: 'call_refund',
        type: 'function',
        function: { name: 'refund', arguments: '{"order":42}' },
      },
    ],
  },
  { id: 'b2', role: 'tool', toolCallId: 'call_refund', content: 'refunded' },
  { id: 'b3', role: 'assistant', content: 'Order 42 is refunded.' },
]

const TRANSCRIPTS: Record<string, Array<ModelMessage>> = {
  s1: BILLING_TRANSCRIPT,
  s2: [
    { id: 'task2', role: 'user', content: 'Find papers' },
    { id: 'c1', role: 'assistant', content: 'Found 3 papers.' },
  ],
}

function host(runId: string, agent: string, text: string): ModelMessage {
  return {
    id: `assistant:${runId}`,
    role: 'assistant',
    content: `${agent}:\n${text}`,
    metadata: { tanstack: { runId }, harness: { agent } },
  }
}

const USER: ModelMessage = { id: 'u1', role: 'user', content: 'Hi' }
const BILLING_HOST = host('r1', 'billing', 'Order 42 is refunded.')
const RESEARCH_HOST = host('r2', 'research', 'Found 3 papers.')

function handoffCall(
  id: string,
  name: string,
  args: Record<string, unknown>,
): ModelMessage {
  return {
    id: `m_${id}`,
    role: 'assistant',
    content: 'Let me pass you on.',
    toolCalls: [
      {
        id,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  }
}

function toolResult(toolCallId: string): ModelMessage {
  return {
    id: `${toolCallId}_result`,
    role: 'tool',
    toolCallId,
    content: 'Handed off to billing. billing answers next.',
  }
}

function history(options: {
  messages: Array<ModelMessage>
  speaker: string | null
  mode: 'own' | 'all' | 'text'
  handoffToolName?: string
  transcripts?: Record<string, Array<ModelMessage>>
  children?: Record<string, Array<Child>>
  isThreadMessage?: (message: ModelMessage) => boolean
}) {
  const transcripts = options.transcripts ?? TRANSCRIPTS
  const children = options.children ?? CHILDREN
  return historyFor({
    ...options,
    childrenOf: (runId) => children[runId] ?? [],
    transcriptOf: (subagentRunId) =>
      Promise.resolve(transcripts[subagentRunId] ?? []),
  })
}

describe('historyFor', () => {
  it("returns the messages unchanged in 'text' mode", async () => {
    const messages = [USER, BILLING_HOST, RESEARCH_HOST]
    const result = await history({ messages, speaker: 'billing', mode: 'text' })
    expect(result).toEqual([USER, BILLING_HOST, RESEARCH_HOST])
  })

  it("gives a routed agent its own runs in full and others as text in 'own' mode", async () => {
    const result = await history({
      messages: [USER, BILLING_HOST, RESEARCH_HOST],
      speaker: 'billing',
      mode: 'own',
    })
    expect(result).toEqual([
      USER,
      BILLING_TRANSCRIPT[1],
      BILLING_TRANSCRIPT[2],
      BILLING_TRANSCRIPT[3],
      // Another agent's answer: a user message, so billing does not read
      // it as its own.
      { ...RESEARCH_HOST, role: 'user' },
    ])
  })

  it("folds a main handoff call to text for a routed agent in 'own' mode", async () => {
    const call = handoffCall('call_h', 'handoff', {
      to: 'billing',
      note: 'refund for order 42',
    })
    const result = await history({
      messages: [USER, call, toolResult('call_h')],
      speaker: 'billing',
      mode: 'own',
    })
    expect(result).toEqual([
      USER,
      {
        id: 'm_call_h',
        role: 'user',
        content:
          'main:\nLet me pass you on.\n\nmain handed off to billing. Note: refund for order 42',
      },
    ])
  })

  it('folds a handoff to a person and drops the other tool calls of main', async () => {
    const call: ModelMessage = {
      id: 'm2',
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call_w',
          type: 'function',
          function: { name: 'weather', arguments: '{}' },
        },
        {
          id: 'call_p',
          type: 'function',
          function: {
            name: 'handoff',
            arguments: JSON.stringify({ to: { human: true } }),
          },
        },
      ],
    }
    const result = await history({
      messages: [call, toolResult('call_w'), toolResult('call_p')],
      speaker: 'billing',
      mode: 'own',
    })
    expect(result).toEqual([
      { id: 'm2', role: 'user', content: 'main handed off to a person.' },
    ])
  })

  it('folds a stamped recorded note instead of the model call args', async () => {
    const call = {
      ...handoffCall('call_h', 'handoff', {
        to: 'billing',
        note: 'Refund for order 42.',
      }),
      metadata: {
        harness: { handoffNote: 'from main: Refund for order 42.' },
      },
    }
    const result = await history({
      messages: [USER, call, toolResult('call_h')],
      speaker: 'billing',
      mode: 'own',
    })
    expect(result).toEqual([
      USER,
      {
        id: 'm_call_h',
        role: 'user',
        content:
          'main:\nLet me pass you on.\n\nmain handed off to billing. Note: from main: Refund for order 42.',
        metadata: {
          harness: { handoffNote: 'from main: Refund for order 42.' },
        },
      },
    ])
  })

  it('reads the handoff tool name from handoffToolName', async () => {
    const custom = handoffCall('call_t', 'transfer', { to: 'billing' })
    const builtIn = handoffCall('call_b', 'handoff', { to: 'research' })
    const result = await history({
      messages: [custom, toolResult('call_t'), builtIn, toolResult('call_b')],
      speaker: 'billing',
      mode: 'own',
      handoffToolName: 'transfer',
    })
    expect(result).toEqual([
      {
        id: 'm_call_t',
        role: 'user',
        content: 'main:\nLet me pass you on.\n\nmain handed off to billing.',
      },
      {
        id: 'm_call_b',
        role: 'user',
        content: 'main:\nLet me pass you on.',
      },
    ])
  })

  it("keeps the main model's own calls and gives it routed answers as user text in 'own' mode", async () => {
    const call = handoffCall('call_h', 'handoff', { to: 'billing' })
    const messages = [USER, call, toolResult('call_h'), BILLING_HOST]
    const result = await history({ messages, speaker: null, mode: 'own' })
    expect(result).toEqual([
      USER,
      call,
      toolResult('call_h'),
      { ...BILLING_HOST, role: 'user' },
    ])
  })

  it("expands every routed run for the main model in 'all' mode", async () => {
    const call = handoffCall('call_h', 'handoff', { to: 'billing' })
    const result = await history({
      messages: [USER, call, toolResult('call_h'), BILLING_HOST, RESEARCH_HOST],
      speaker: null,
      mode: 'all',
    })
    expect(result).toEqual([
      USER,
      call,
      toolResult('call_h'),
      BILLING_TRANSCRIPT[1],
      BILLING_TRANSCRIPT[2],
      BILLING_TRANSCRIPT[3],
      TRANSCRIPTS.s2?.[1],
    ])
  })

  it('expands a kept earlier pass of a run by its harness routedRunId', async () => {
    // One run with two passes: billing's pass moved to its own id and lost
    // its tanstack run id. research wrote the last pass.
    const keptPass: ModelMessage = {
      id: 'assistant:r3:1',
      role: 'assistant',
      content: 'billing:\nOrder 42 is refunded.',
      metadata: {
        tanstack: {},
        harness: { agent: 'billing', routedRunId: 'r3' },
      },
    }
    const lastPass = host('r3', 'research', 'Found 3 papers.')
    const result = await history({
      messages: [USER, keptPass, lastPass],
      speaker: 'billing',
      mode: 'own',
      children: {
        r3: [
          { name: 'billing', subagentRunId: 's1' },
          { name: 'research', subagentRunId: 's2' },
        ],
      },
    })
    expect(result).toEqual([
      USER,
      BILLING_TRANSCRIPT[1],
      BILLING_TRANSCRIPT[2],
      BILLING_TRANSCRIPT[3],
      { ...lastPass, role: 'user' },
    ])
  })

  it('keeps the messages that are not in the thread as they are', async () => {
    const ownCall = handoffCall('call_own', 'lookup', {})
    const result = await history({
      messages: [USER, ownCall, toolResult('call_own')],
      speaker: 'billing',
      mode: 'own',
      isThreadMessage: (message) => message.id === USER.id,
    })
    expect(result).toEqual([USER, ownCall, toolResult('call_own')])
  })

  it('keeps the host message when the run has no stored transcript', async () => {
    const result = await history({
      messages: [USER, BILLING_HOST],
      speaker: 'billing',
      mode: 'own',
      transcripts: {},
    })
    expect(result).toEqual([USER, BILLING_HOST])
  })

  it('folds a router note pair of another agent to one text line', async () => {
    const metadata = {
      harness: { agent: 'billing', handoff: { by: 'router' } },
    }
    const note: ModelMessage = {
      id: 'n1',
      role: 'assistant',
      content: null,
      toolCalls: [
        {
          id: 'n1',
          type: 'function',
          function: {
            name: 'handoff',
            arguments: JSON.stringify({ to: 'main', note: 'needs a human' }),
          },
        },
      ],
      metadata,
    }
    const result = await history({
      messages: [USER, note, { ...toolResult('n1'), metadata }],
      speaker: 'research',
      mode: 'own',
    })
    expect(result).toEqual([
      USER,
      {
        id: 'n1',
        role: 'user',
        content: 'billing handed off to main. Note: needs a human',
        metadata,
      },
    ])
  })
})

describe('routedHistoryMiddleware', () => {
  const middleware = routedHistoryMiddleware({
    mode: 'own',
    childrenOf: (runId) => CHILDREN[runId] ?? [],
    transcriptOf: (subagentRunId) =>
      Promise.resolve(TRANSCRIPTS[subagentRunId] ?? []),
  })
  const config = { messages: [USER, BILLING_HOST] }

  it('sets providerMessages for a routed agent', async () => {
    const change = await middleware.onConfig(
      { subagentName: 'billing' },
      config,
    )
    expect(change).toEqual({
      providerMessages: [
        USER,
        BILLING_TRANSCRIPT[1],
        BILLING_TRANSCRIPT[2],
        BILLING_TRANSCRIPT[3],
      ],
    })
  })

  it("gives the main model a routed answer as user text in 'own' mode", async () => {
    const change = await middleware.onConfig({}, config)
    expect(change).toEqual({
      providerMessages: [USER, { ...BILLING_HOST, role: 'user' }],
    })
  })

  it('changes nothing for a nested child of a routed agent', async () => {
    const change = await middleware.onConfig(
      { subagentName: 'billing', parentSubagentRunId: 's1' },
      config,
    )
    expect(change).toBeUndefined()
  })
})
