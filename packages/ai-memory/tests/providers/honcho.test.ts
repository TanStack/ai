import { describe, expect, it, vi } from 'vitest'
import {
  honcho,
  parseHonchoRepresentation,
} from '../../src/providers/honcho/index'

/**
 * `@honcho-ai/sdk` is mocked here — no server, no socket. The mock returns
 * canned peers/sessions so we can assert the adapter maps `recall`/`save` onto
 * the SDK correctly. `parseHonchoRepresentation` is a pure function and needs
 * no mocking at all.
 */
vi.mock('@honcho-ai/sdk', () => {
  class Honcho {
    constructor(_opts: unknown) {}
    peer(id: string) {
      return {
        id,
        message: (content: string) => ({ peer: id, content }),
        chat: async (query: string) => `dialectic answer about: ${query}`,
        representation: async () =>
          '[2024-05-01T10:00:00Z] user lives in Berlin\n[2024-05-02T11:00:00Z] user likes hiking',
      }
    }
    session(id: string) {
      return {
        id,
        addMessages: async (messages: Array<unknown>) => ({
          added: messages.length,
        }),
        messages: async () => [],
        summaries: async () => [],
      }
    }
  }
  return { Honcho }
})

describe('parseHonchoRepresentation', () => {
  it('parses timestamped observation lines into fact rows', () => {
    const facts = parseHonchoRepresentation(
      '[2024-05-01T10:00:00Z] user lives in Berlin',
    )
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({
      text: 'user lives in Berlin',
      source: 'observation',
      createdAt: '2024-05-01T10:00:00Z',
    })
  })

  it('keeps plain lines and skips headers/blank lines', () => {
    const facts = parseHonchoRepresentation(
      ['## Explicit Observations', '', 'user prefers dark mode'].join('\n'),
    )
    expect(facts.map((f) => f.text)).toEqual(['user prefers dark mode'])
    expect(facts[0]?.source).toBe('representation')
  })
})

describe('honcho factory', () => {
  it('exposes the recall/save contract with a stable id', () => {
    const adapter = honcho({ user: 'u1' })
    expect(adapter.id).toBe('honcho')
    expect(typeof adapter.recall).toBe('function')
    expect(typeof adapter.save).toBe('function')
    expect(typeof adapter.inspect).toBe('function')
    expect(typeof adapter.listFacts).toBe('function')
  })

  it('save appends the turn and returns an ok receipt', async () => {
    const adapter = honcho({ user: 'u1' })
    const receipts = await adapter.save(
      { sessionId: 's1', userId: 'u1' },
      { user: 'I live in Berlin', assistant: 'noted' },
    )
    expect(receipts).toHaveLength(1)
    expect(receipts[0]?.ok).toBe(true)
    expect(receipts[0]?.raw).toMatchObject({ added: 2 })
  })

  it('recall returns the dialectic answer as the systemPrompt', async () => {
    const adapter = honcho({ user: 'u1' })
    const result = await adapter.recall(
      { sessionId: 's1', userId: 'u1' },
      'where do I live',
    )
    expect(result.systemPrompt).toBe('dialectic answer about: where do I live')
  })

  it('listFacts parses the peer representation into rows', async () => {
    const adapter = honcho({ user: 'u1' })
    const facts = await adapter.listFacts?.({ sessionId: 's1', userId: 'u1' })
    expect(facts?.map((f) => f.text)).toEqual([
      'user lives in Berlin',
      'user likes hiking',
    ])
  })
})
