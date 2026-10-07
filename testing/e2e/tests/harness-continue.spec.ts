import { test, expect } from './fixtures'

interface WireMessage {
  role: string
  text: string
}

test.describe('harness: continue after a partial answer', () => {
  test('a stream that fails in the middle continues its partial text', async ({
    request,
  }) => {
    const res = await request.post('/api/harness-continue')
    expect(res.ok()).toBe(true)
    const result: {
      error?: string
      text: string
      requests: Array<Array<WireMessage>>
    } = await res.json()
    expect(result.error ?? null).toBeNull()

    expect(result.text).toBe('Hello world')
    expect(result.requests).toHaveLength(2)
    const [prompt, partial, note] = result.requests[1]!
    expect(prompt).toEqual({
      role: 'user',
      text: '[harness-continue] say hello world',
    })
    expect(partial).toEqual({ role: 'assistant', text: 'Hello wor' })
    expect(note!.role).toBe('user')
    expect(note!.text).toContain('Continue from the exact point')
  })
})
