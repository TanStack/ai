import { test, expect } from './fixtures'

interface Result {
  error?: string
  receipt: { status: string }
  first: string
  followUp?: string
  ownerCalls: number
  otherCalls: number
  transcript: Array<{ role: string; text: string }>
}

test.describe('harness: an input on a host that does not own the thread', () => {
  test('waits in the log for the owner, and the owner runs it after its turn', async ({
    request,
  }) => {
    const res = await request.post('/api/harness-forwarding')
    expect(res.ok()).toBe(true)
    const result: Result = await res.json()
    expect(result.error ?? null).toBeNull()

    expect(result.receipt.status).toBe('queued')
    expect(result.first).toBe('One.')
    expect(result.followUp).toBe('completed')
    // Both answers came from the model of the owner.
    expect(result.ownerCalls).toBe(2)
    expect(result.otherCalls).toBe(0)
    expect(result.transcript).toEqual([
      { role: 'user', text: '[harness-forwarding] go' },
      { role: 'assistant', text: 'One.' },
      { role: 'user', text: '[harness-forwarding] and then' },
      { role: 'assistant', text: 'Two.' },
    ])
  })
})

test.describe('harness: the host that does not own the thread', () => {
  test('the host that does not own the thread shows running, then idle', async ({
    request,
  }) => {
    const res = await request.post('/api/harness-forwarding?scenario=status')
    expect(res.ok()).toBe(true)
    const result: {
      error?: string
      statuses: Array<string>
      text: string
      ownerCalls: number
      otherCalls: number
    } = await res.json()
    expect(result.error ?? null).toBeNull()

    expect(result.text).toBe('One.')
    // The other host runs nothing. Its status comes from the log tail.
    expect(result.statuses).toEqual(['idle', 'running', 'idle'])
    expect(result.ownerCalls).toBe(1)
    expect(result.otherCalls).toBe(0)
  })

  test('a cancel sent to the other host stops the turn', async ({
    request,
  }) => {
    const res = await request.post('/api/harness-forwarding?scenario=cancel')
    expect(res.ok()).toBe(true)
    const result: {
      error?: string
      receipt: { status: string }
      outcome: { text?: string; error?: string }
      turnStatus: string
      ownerCalls: number
      otherCalls: number
    } = await res.json()
    expect(result.error ?? null).toBeNull()

    // The other host stores the cancel in the log, and the owner applies it.
    expect(result.receipt.status).toBe('queued')
    expect(result.outcome).toEqual({ error: 'Cancelled.' })
    expect(result.turnStatus).toBe('cancelled')
    expect(result.ownerCalls).toBe(1)
    expect(result.otherCalls).toBe(0)
  })
})
