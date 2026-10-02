import { describe, expect, it } from 'vitest'
import { splitMidConversationChanges } from '../src/utilities/mid-conversation'
import * as adapterInternals from '../src/adapter-internals'
import * as ai from '../src/index'
import type { MidConversationChanges } from '../src/types'
import type { SystemPrompt } from '../src/system-prompts'

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
    expect(adapterInternals.splitMidConversationChanges).toBe(
      splitMidConversationChanges,
    )
    expect(ai.splitMidConversationChanges).toBe(splitMidConversationChanges)
  })
})
