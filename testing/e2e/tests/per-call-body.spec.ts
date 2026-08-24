import { test, expect } from './fixtures'
import {
  featureUrl,
  getLastAssistantMessage,
  sendMessage,
  waitForResponse,
} from './helpers'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Fixture: fixtures/chat/basic.json ("[per-call-body] send with per-call body").
//
// Coverage for SendMessageOptions.body: the chat page sends the
// `[per-call-body]` prompt via
// `sendMessage(text, { body: { perCallBodyMarker: testId } })`.
//
// The load-bearing assertion is on the page → /api/chat POST body:
// `forwardedProps` must contain the per-call marker MERGED with the
// chat-level `body` keys (provider/feature/testId/…). A regression that
// dropped `options.body` fails the marker assertion. One that replaced
// the merge fails the provider/feature assertions.
test.describe('per-call sendMessage body', () => {
  test('options.body reaches the wire under forwardedProps, merged with chat-level body', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const chatRequestBodies: Array<Record<string, unknown>> = []
    page.on('request', (req) => {
      if (req.method() !== 'POST') return
      if (!req.url().endsWith('/api/chat')) return
      const raw = req.postData()
      if (!raw) return
      try {
        const parsed: unknown = JSON.parse(raw)
        if (isRecord(parsed)) {
          chatRequestBodies.push(parsed)
        }
      } catch {
        // Non-JSON bodies are unrelated to the chat round-trip.
      }
    })

    await page.goto(featureUrl('openai', 'chat', testId, aimockPort))

    await sendMessage(page, '[per-call-body] send with per-call body')
    await waitForResponse(page)
    const response = await getLastAssistantMessage(page)
    expect(response).toContain('Acknowledged the per-call body send.')

    expect(chatRequestBodies).toHaveLength(1)
    const fp = chatRequestBodies[0]?.forwardedProps
    expect(isRecord(fp)).toBe(true)
    if (!isRecord(fp)) return
    expect(fp.perCallBodyMarker).toBe(testId)
    expect(fp.provider).toBe('openai')
    expect(fp.feature).toBe('chat')
    expect(fp.testId).toBe(testId)
  })
})
