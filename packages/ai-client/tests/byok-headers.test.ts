import { describe, expect, it, vi } from 'vitest'
import { ByokMissingError, byokMissing } from '@tanstack/ai/byok'
import {
  fetchServerSentEvents,
  fetcherToConnectionAdapter,
} from '../src/connection-adapters'
import type { ChatFetcher } from '../src/types'

describe('runContext.headers', () => {
  it('merges BYOK headers onto the fetch request', async () => {
    const fetchClient = vi.fn<typeof fetch>(async () => byokMissing('openai'))
    const connection = fetchServerSentEvents('/api/chat', { fetchClient })
    const runContext = {
      threadId: 't1',
      runId: 'r1',
      headers: { 'x-byok-openai': 'sk-live' },
    }
    await expect(async () => {
      for await (const _chunk of connection.connect(
        [],
        {},
        undefined,
        runContext,
      )) {
        void _chunk
      }
    }).rejects.toBeInstanceOf(ByokMissingError)
    const init = fetchClient.mock.calls[0]![1]
    const headers = new Headers(init?.headers)
    expect(headers.get('x-byok-openai')).toBe('sk-live')
    const body = JSON.parse(String(init?.body)) as { forwardedProps?: unknown }
    expect(JSON.stringify(body)).not.toContain('sk-live')
  })

  it('passes headers into a ChatFetcher', async () => {
    const fetcher = vi.fn<ChatFetcher>(async () => byokMissing('openai'))
    const adapter = fetcherToConnectionAdapter(fetcher)
    const abort = new AbortController()
    await expect(async () => {
      for await (const _chunk of adapter.connect([], {}, abort.signal, {
        threadId: 't1',
        runId: 'r1',
        headers: { 'x-byok-openai': 'sk-live' },
      })) {
        void _chunk
      }
    }).rejects.toThrow()
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      headers: { 'x-byok-openai': 'sk-live' },
    })
  })

  it('does not throw when a custom connect ignores headers', async () => {
    async function* connect() {
      return
    }
    const adapter = { connect }
    await expect(
      (async () => {
        for await (const _chunk of adapter.connect()) {
          void _chunk
        }
      })(),
    ).resolves.toBeUndefined()
  })
})
