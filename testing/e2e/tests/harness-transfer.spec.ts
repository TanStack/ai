import { test, expect } from './fixtures'

interface Link {
  transferId: string
  harness: string
  threadId: string
}

interface Entry {
  harness: string
  members: Array<{ userId: string; role: string }>
  parentThreadId?: string
  metadata?: {
    'harness:transferredFrom'?: Array<Link>
    'harness:transferredTo'?: Array<Link>
  }
}

interface Result {
  error?: string
  otherTenant: string
  first: { transferId: string; threadId: string }
  second: { transferId: string; threadId: string }
  sourceTranscript: Array<{ role: string; text: string }>
  targetTranscript: Array<{ role: string; text: string }>
  targetEntry: Entry
  sourceEntry: Entry
  threads: number
  globexThreads: number
  transfers: {
    afterFirst: { messages: number; records: number }
    target: Array<{ transferId: string; from?: unknown }>
    source: Array<{ transferId: string; to?: unknown }>
  }
}

const SUPPORT = 'e2e/harness-transfer-support'
const BILLING = 'e2e/harness-transfer-billing'
// The id of the source thread, which the route makes.
const SOURCE_ID = expect.stringMatching(/^e2e-harness-transfer-/)
const NOTE = 'Refund for order 42. The user waits.'

test.describe('harness: a transfer to another harness', () => {
  test("moves the messages and the note with messages: 'all', links both threads, and a retry adds nothing", async ({
    request,
  }) => {
    const res = await request.post('/api/harness-transfer')
    expect(res.ok()).toBe(true)
    const result: Result = await res.json()
    expect(result.error ?? null).toBeNull()

    // A user of another tenant is refused, and gets no thread.
    expect(result.otherTenant).toBe('denied')
    expect(result.globexThreads).toBe(0)

    // The target thread has the note first, then the messages of the source.
    const { first } = result
    expect(result.sourceTranscript).toEqual([
      { role: 'user', text: 'Hi.' },
      { role: 'assistant', text: 'Support here.' },
      { role: 'user', text: 'I want a refund.' },
      { role: 'assistant', text: 'I pass you to billing.' },
    ])
    expect(result.targetTranscript).toEqual([
      { role: 'user', text: NOTE },
      ...result.sourceTranscript,
    ])

    // The target belongs to the billing harness, and olga owns it alone.
    expect(result.targetEntry).toMatchObject({
      harness: BILLING,
      members: [{ userId: 'olga', role: 'owner' }],
    })
    expect(result.targetEntry.parentThreadId).toBeUndefined()

    // Both threads show the link, in the index and in the log.
    const source = result.sourceEntry
    expect(result.targetEntry.metadata?.['harness:transferredFrom']).toEqual([
      { transferId: first.transferId, harness: SUPPORT, threadId: SOURCE_ID },
    ])
    expect(source.metadata?.['harness:transferredTo']).toEqual([
      {
        transferId: first.transferId,
        harness: BILLING,
        threadId: first.threadId,
      },
    ])
    expect(result.transfers.target).toEqual([
      expect.objectContaining({
        transferId: first.transferId,
        from: { harness: SUPPORT, threadId: SOURCE_ID },
      }),
    ])
    expect(result.transfers.source).toEqual([
      expect.objectContaining({
        transferId: first.transferId,
        to: { harness: BILLING, threadId: first.threadId },
      }),
    ])

    // The retry with the same transferId returns the same target, and adds
    // no thread, no message, and no record.
    expect(result.second).toEqual(first)
    expect(result.threads).toBe(2)
    expect(result.transfers.afterFirst).toEqual({
      messages: result.targetTranscript.length,
      records: result.transfers.target.length,
    })
  })
})
