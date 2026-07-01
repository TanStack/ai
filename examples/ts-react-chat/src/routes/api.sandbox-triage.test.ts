import { afterEach, describe, expect, it } from 'vitest'
import { triagePost } from './api.sandbox-triage'

function post(body: unknown): Promise<Response> {
  return triagePost(
    new Request('http://localhost/api/sandbox-triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
})

describe('POST /api/sandbox-triage', () => {
  it('400s on an invalid harness/provider', async () => {
    const res = await post({
      messages: [{ role: 'user', content: 'go' }],
      data: {
        harness: 'nope',
        provider: 'docker',
        issueUrl: 'x',
        threadId: 't',
      },
    })
    expect(res.status).toBe(400)
  })

  it('500s when a required key env is missing', async () => {
    const res = await post({
      messages: [{ role: 'user', content: 'go' }],
      data: {
        harness: 'claude-code',
        provider: 'docker',
        issueUrl: 'https://github.com/a/b/issues/1',
        threadId: 't',
      },
    })
    expect(res.status).toBe(500)
    expect(await res.text()).toMatch(/ANTHROPIC_API_KEY/)
  })

  it('400s on a malformed issue URL (key present)', async () => {
    process.env.ANTHROPIC_API_KEY = 'x'
    const res = await post({
      messages: [{ role: 'user', content: 'go' }],
      data: {
        harness: 'claude-code',
        provider: 'docker',
        issueUrl: 'not-an-issue',
        threadId: 't',
      },
    })
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/issue url/i)
  })
})
