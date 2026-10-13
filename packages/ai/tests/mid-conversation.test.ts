import { describe, expect, it } from 'vitest'
import {
  planMidConversationChanges,
  promptHash,
  splitMidConversationChanges,
} from '../src/utilities/mid-conversation'
import * as adapterInternals from '../src/adapter-internals'
import * as ai from '../src/index'
import type {
  MidConversationChange,
  MidConversationChanges,
  ModelMessage,
} from '../src/types'
import type { SystemPrompt } from '../src/system-prompts'

const user = (content: string): ModelMessage => ({ role: 'user', content })

/** An assistant message, with `record` as its mid-conversation record. */
const assistant = (record?: MidConversationChange): ModelMessage => ({
  role: 'assistant',
  content: 'ok',
  ...(record ? { midConversationChange: record } : {}),
})

const plan = (
  messages: Array<ModelMessage>,
  toolNames: Array<string>,
  systemPrompts: Array<string> = [],
) => planMidConversationChanges({ messages, toolNames, systemPrompts })

describe('promptHash', () => {
  it('is FNV-1a 32-bit as 8 hex characters', () => {
    expect(promptHash('')).toBe('811c9dc5')
    expect(promptHash('a')).toBe('e40c292c')
    expect(promptHash('foobar')).toBe('bf9cf968')
  })

  it('pads a short hash with zeros', () => {
    expect(promptHash('p426')).toBe('01483fad')
  })
})

describe('planMidConversationChanges', () => {
  it('makes a start point when no assistant message has a record', () => {
    // A record on a user message is not read.
    const messages = [{ ...user('q'), midConversationChange: { tools: ['x'] } }]

    expect(plan(messages, ['a', 'b'], ['A'])).toEqual({
      changes: { start: { tools: ['a', 'b'], systemPrompts: 1 }, changes: [] },
      record: { tools: ['a', 'b'], systemPrompts: [promptHash('A')] },
    })
  })

  it('records an added tool as a change before the next message', () => {
    const messages = [
      user('q1'),
      assistant({ tools: ['a'], systemPrompts: [] }),
      user('q2'),
    ]

    expect(plan(messages, ['a', 'b'])).toEqual({
      changes: {
        start: { tools: ['a'], systemPrompts: 0 },
        changes: [{ before: 3, tools: ['b'] }],
      },
      record: { toolsAdded: ['b'] },
    })
  })

  it('records a prompt added at the end as a change', () => {
    const messages = [
      user('q1'),
      assistant({ tools: ['a'], systemPrompts: [promptHash('A')] }),
      user('q2'),
    ]

    expect(plan(messages, ['a'], ['A', 'B'])).toEqual({
      changes: {
        start: { tools: ['a'], systemPrompts: 1 },
        changes: [{ before: 3, systemPrompts: 1 }],
      },
      record: { systemPrompts: [promptHash('B')] },
    })
  })

  it('keeps the earlier changes and adds no record when nothing was added', () => {
    const messages = [
      user('q1'),
      assistant({ tools: ['a'], systemPrompts: [promptHash('A')] }),
      user('q2'),
      assistant({ toolsAdded: ['b'], systemPrompts: [promptHash('B')] }),
      user('q3'),
    ]

    const result = plan(messages, ['a', 'b'], ['A', 'B'])

    expect(result.changes).toEqual({
      start: { tools: ['a'], systemPrompts: 1 },
      changes: [{ before: 3, tools: ['b'], systemPrompts: 1 }],
    })
    expect(result.record).toBeUndefined()
  })

  it('makes a start point when a recorded tool is gone', () => {
    const messages = [
      user('q1'),
      assistant({ tools: ['a', 'b'], systemPrompts: [] }),
      user('q2'),
    ]

    expect(plan(messages, ['a'])).toEqual({
      changes: { start: { tools: ['a'], systemPrompts: 0 }, changes: [] },
      record: { tools: ['a'], systemPrompts: [] },
    })
  })

  it.each<[string, Array<string>]>([
    ['edited', ['A2', 'B']],
    ['reordered', ['B', 'A']],
    ['removed', ['A']],
  ])('makes a start point when a recorded prompt is %s', (_label, prompts) => {
    const messages = [
      user('q1'),
      assistant({
        tools: ['a'],
        systemPrompts: [promptHash('A'), promptHash('B')],
      }),
      user('q2'),
    ]

    expect(plan(messages, ['a'], prompts)).toEqual({
      changes: {
        start: { tools: ['a'], systemPrompts: prompts.length },
        changes: [],
      },
      record: {
        tools: ['a'],
        systemPrompts: prompts.map((prompt) => promptHash(prompt)),
      },
    })
  })

  it('makes a start point for the first tools after a start point with no tools', () => {
    const messages = [
      user('q1'),
      assistant({ tools: [], systemPrompts: [] }),
      user('q2'),
    ]

    expect(plan(messages, ['a'])).toEqual({
      changes: { start: { tools: ['a'], systemPrompts: 0 }, changes: [] },
      record: { tools: ['a'], systemPrompts: [] },
    })
  })

  it('adds a prompt to a start point with no tools', () => {
    const messages = [
      user('q1'),
      assistant({ tools: [], systemPrompts: [promptHash('A')] }),
      user('q2'),
    ]

    expect(plan(messages, [], ['A', 'B'])).toEqual({
      changes: {
        start: { tools: [], systemPrompts: 1 },
        changes: [{ before: 3, systemPrompts: 1 }],
      },
      record: { systemPrompts: [promptHash('B')] },
    })
  })

  it('ignores a change before any start point', () => {
    const messages = [
      assistant({ toolsAdded: ['x'] }),
      user('q1'),
      assistant({ tools: ['a'], systemPrompts: [] }),
      user('q2'),
    ]

    expect(plan(messages, ['a'])).toEqual({
      changes: { start: { tools: ['a'], systemPrompts: 0 }, changes: [] },
    })
  })

  it('makes a start point when the only record is a change', () => {
    // Compaction can drop the start point and keep a later change.
    const messages = [assistant({ toolsAdded: ['b'] }), user('q')]

    expect(plan(messages, ['a', 'b'])).toEqual({
      changes: { start: { tools: ['a', 'b'], systemPrompts: 0 }, changes: [] },
      record: { tools: ['a', 'b'], systemPrompts: [] },
    })
  })

  it('starts the changes again at a later start point', () => {
    const messages = [
      user('q1'),
      assistant({ tools: ['a'], systemPrompts: [] }),
      user('q2'),
      assistant({ toolsAdded: ['b'] }),
      user('q3'),
      assistant({ tools: ['a', 'b'], systemPrompts: [] }),
      user('q4'),
    ]

    expect(plan(messages, ['a', 'b'])).toEqual({
      changes: { start: { tools: ['a', 'b'], systemPrompts: 0 }, changes: [] },
    })
  })
})

describe('splitMidConversationChanges', () => {
  const a = { name: 'a' }
  const b = { name: 'b' }
  const c = { name: 'c' }

  it('splits the current lists into the start and the changes', () => {
    const result = splitMidConversationChanges({
      changes: {
        start: { tools: ['b', 'a'], systemPrompts: 1 },
        changes: [
          { before: 3, systemPrompts: 1 },
          { before: 5, tools: ['c'] },
        ],
      },
      tools: [a, b, c],
      systemPrompts: ['A', 'B'],
    })

    expect(result).toEqual({
      startTools: [b, a],
      startSystemPrompts: ['A'],
      addedTools: [c],
      at: new Map([
        [3, { tools: [], systemPrompts: ['B'] }],
        [5, { tools: [c], systemPrompts: [] }],
      ]),
    })
  })

  it.each<[string, MidConversationChanges]>([
    [
      'a start tool is missing',
      {
        start: { tools: ['a', 'gone'], systemPrompts: 1 },
        changes: [{ before: 1, tools: ['b', 'c'] }],
      },
    ],
    [
      'an added tool is missing',
      {
        start: { tools: ['a'], systemPrompts: 1 },
        changes: [{ before: 1, tools: ['b', 'gone'] }],
      },
    ],
    [
      'a current tool has no place',
      {
        start: { tools: ['a'], systemPrompts: 1 },
        changes: [{ before: 1, tools: ['b'] }],
      },
    ],
    [
      'a tool is named twice',
      {
        start: { tools: ['a', 'b'], systemPrompts: 1 },
        changes: [{ before: 1, tools: ['b', 'c'] }],
      },
    ],
    [
      'the start has more prompts than the list',
      { start: { tools: ['a', 'b', 'c'], systemPrompts: 2 }, changes: [] },
    ],
    [
      'a change has more prompts than are left',
      {
        start: { tools: ['a', 'b', 'c'], systemPrompts: 0 },
        changes: [{ before: 1, systemPrompts: 2 }],
      },
    ],
    [
      'a prompt has no place',
      { start: { tools: ['a', 'b', 'c'], systemPrompts: 0 }, changes: [] },
    ],
    [
      'two changes have the same place',
      {
        start: { tools: ['a'], systemPrompts: 0 },
        changes: [
          { before: 1, tools: ['b'] },
          { before: 1, tools: ['c'], systemPrompts: 1 },
        ],
      },
    ],
  ])('returns undefined when %s', (_label, changes) => {
    expect(
      splitMidConversationChanges({
        changes,
        tools: [a, b, c],
        systemPrompts: ['A'],
      }),
    ).toBeUndefined()
  })

  it('keeps the prompt objects, with their metadata', () => {
    const cached: SystemPrompt = {
      content: 'A',
      metadata: { cache_control: { type: 'ephemeral' } },
    }
    const prompts: Array<SystemPrompt> = [cached, 'B']

    const result = splitMidConversationChanges({
      changes: {
        start: { tools: ['a'], systemPrompts: 1 },
        changes: [{ before: 2, systemPrompts: 1 }],
      },
      tools: [a],
      systemPrompts: prompts,
    })

    expect(result?.startSystemPrompts[0]).toBe(cached)
    expect(result?.at.get(2)?.systemPrompts).toEqual(['B'])
  })
})

describe('mid-conversation exports', () => {
  it('gives adapter authors the helpers', () => {
    expect(adapterInternals.promptHash).toBe(promptHash)
    expect(adapterInternals.planMidConversationChanges).toBe(
      planMidConversationChanges,
    )
    expect(adapterInternals.splitMidConversationChanges).toBe(
      splitMidConversationChanges,
    )
    expect(ai.splitMidConversationChanges).toBe(splitMidConversationChanges)
  })
})
