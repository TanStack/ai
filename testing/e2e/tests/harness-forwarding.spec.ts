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
