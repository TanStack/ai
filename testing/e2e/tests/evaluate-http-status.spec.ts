import { test, expect } from './fixtures'

const CASES = [
  {
    provider: 'typesafe',
    status: 429,
    message:
      'TypeSafe evaluate request failed: 429 Too Many Requests \u2014 {"error":"rejected"}',
  },
  {
    provider: 'vercel-gateway',
    status: 503,
    message:
      'Vercel Gateway evaluate request failed: 503 Service Unavailable \u2014 {"error":"rejected"}',
  },
] as const

test.describe('decide() on a non-ok provider response', () => {
  for (const { provider, status, message } of CASES) {
    test(`${provider} rejects with the HTTP status on the error`, async ({
      request,
    }) => {
      const response = await request.post(
        `/api/evaluate-http-status?provider=${provider}&status=${status}`,
      )
      expect(response.ok()).toBe(true)

      const result = (await response.json()) as {
        ok: boolean
        error?: { name?: string; message: string; status?: number }
      }
      expect(result).toEqual({
        ok: false,
        error: { name: 'Error', message, status },
      })
    })
  }
})
