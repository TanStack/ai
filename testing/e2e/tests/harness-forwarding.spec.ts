import { test, expect } from './fixtures'

interface Result {
  error?: string
  receipt: { status: string; reason?: string }
  first: string
  followUp?: string
  calls: number
  transcript: Array<{ role: string; text: string }>
}

test.describe('harness: an input on a host that does not own the thread', () => {
  test('waits in the inbox for the owner, and the owner turn ends normally', async ({
    request,
  }) => {
    const res = await request.post('/api/harness-forwarding?inbox=1')
    expect(res.ok()).toBe(true)
    const result: Result = await res.json()
    expect(result.error ?? null).toBeNull()

    expect(result.receipt.status).toBe('queued')
    expect(result.first).toBe('One.')
    expect(result.followUp).toBe('completed')
    expect(result.calls).toBe(2)
    expect(result.transcript).toEqual([
      { role: 'user', text: '[harness-forwarding] go' },
      { role: 'assistant', text: 'One.' },
      { role: 'user', text: '[harness-forwarding] and then' },
      { role: 'assistant', text: 'Two.' },
    ])
  })

  test('keeps the plugin state of the second host off the log, and the owner turn ends normally', async ({
    request,
  }) => {
    const res = await request.post('/api/harness-forwarding?inbox=1&plugin=1')
    expect(res.ok()).toBe(true)
    const result: Result = await res.json()
    expect(result.error ?? null).toBeNull()

    expect(result.receipt.status).toBe('queued')
    expect(result.first).toBe('One.')
    expect(result.followUp).toBe('completed')
    expect(result.calls).toBe(2)
  })

  test('leaves a turn alone when its host claim lapsed but its run lease is live', async ({
    request,
  }) => {
    const res = await request.post('/api/harness-forwarding?stall=1')
    expect(res.ok()).toBe(true)
    const result: Result & { callsDuringStall: number } = await res.json()
    expect(result.error ?? null).toBeNull()

    expect(result.callsDuringStall).toBe(1)
    expect(result.first).toBe('One.')
    expect(result.followUp).toBe('completed')
    expect(result.transcript).toEqual([
      { role: 'user', text: '[harness-forwarding] go' },
      { role: 'assistant', text: 'One.' },
      { role: 'user', text: '[harness-forwarding] and then' },
      { role: 'assistant', text: 'Two.' },
    ])
  })

  test('is refused without an inbox, and the owner turn ends normally', async ({
    request,
  }) => {
    const res = await request.post('/api/harness-forwarding')
    expect(res.ok()).toBe(true)
    const result: Result = await res.json()
    expect(result.error ?? null).toBeNull()

    expect(result.receipt).toEqual({
      status: 'rejected',
      reason: 'owned_elsewhere',
    })
    expect(result.first).toBe('One.')
    expect(result.calls).toBe(1)
  })
})
