import { describe, expect, it } from 'vitest'
import { withGenerationPersistence, withPersistence } from '../src/middleware'
import { reconstructChat } from '../src/reconstruct'
import { defineAIPersistence } from '../src/types'
import type { ChatTranscriptPersistence } from '../src/types'
import {
  createGenerationRunStore,
  createInterruptStore,
  createMessageStore,
  createRunStore,
} from './persistence-fixtures'

/** Cast for intentional runtime-misconfiguration tests. */
function asChatTranscript(
  persistence: ReturnType<typeof defineAIPersistence>,
): ChatTranscriptPersistence {
  return persistence as ChatTranscriptPersistence
}

describe('persistence store dependency validation', () => {
  it('rejects chat persistence without messages', () => {
    const persistence = defineAIPersistence({
      stores: { runs: createRunStore() },
    })

    expect(() => withPersistence(asChatTranscript(persistence))).toThrow(
      /requires stores\.messages/i,
    )
  })

  it('rejects a dynamic chat persistence with interrupts but no runs', () => {
    const persistence = defineAIPersistence({
      stores: {
        messages: createMessageStore(),
        interrupts: createInterruptStore(),
      },
    })

    expect(() => withPersistence(asChatTranscript(persistence))).toThrow(
      /interrupts.*stores\.runs/i,
    )
  })

  it('allows message-only chat persistence', () => {
    const messages = defineAIPersistence({
      stores: { messages: createMessageStore() },
    })

    expect(() => withPersistence(messages)).not.toThrow()
  })

  it('allows a dynamic chat persistence with paired run and interrupt stores', () => {
    const persistence = defineAIPersistence({
      stores: {
        messages: createMessageStore(),
        runs: createRunStore(),
        interrupts: createInterruptStore(),
      },
    })

    expect(() => withPersistence(persistence)).not.toThrow()
  })

  it('rejects generation persistence without generationRuns', () => {
    const persistence = defineAIPersistence({
      stores: { messages: createMessageStore() },
    })

    expect(() =>
      withGenerationPersistence(
        persistence as Parameters<typeof withGenerationPersistence>[0],
        { threadId: 'scope' },
      ),
    ).toThrow(/requires stores\.generationRuns/i)
  })

  it('allows generation persistence with generationRuns', () => {
    const persistence = defineAIPersistence({
      stores: { generationRuns: createGenerationRunStore() },
    })

    expect(() =>
      withGenerationPersistence(persistence, { threadId: 'thread-test' }),
    ).not.toThrow()
  })

  it('rejects reconstructChat without messages', async () => {
    const persistence = defineAIPersistence({
      stores: { runs: createRunStore() },
    })

    await expect(
      reconstructChat(
        asChatTranscript(persistence),
        new Request('http://example.test/api/chat?threadId=t1'),
      ),
    ).rejects.toThrow(/requires stores\.messages/i)
  })
})
