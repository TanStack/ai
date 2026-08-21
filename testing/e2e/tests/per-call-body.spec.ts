import { test, expect } from './fixtures'
import {
  featureUrl,
  getLastAssistantMessage,
  sendMessage,
  waitForResponse,
} from './helpers'

// Fixture: fixtures/chat/basic.json ("[per-call-body] send with per-call body").
//
// Coverage for the per-call `body` on `SendMessageOptions`: the framework
// hooks expose `sendMessage(content, options)` with no positional body arg,
// so `options.body` is their only per-message body channel. The chat page
// sends the `[per-call-body]` prompt via
// `sendMessage(text, { body: { perCallBodyMarker: testId } })`.
//
// The load-bearing assertion is on the page → /api/chat POST body:
// `forwardedProps` must contain the per-call marker MERGED with the
// chat-level `body` keys (provider/feature/testId/…) — a regression that
// dropped `options.body` (the pre-feature behavior: the hooks forwarded
// `undefined`) fails the marker assertion; one that *replaced* the body
// instead of merging fails the provider/feature assertions.
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
        chatRequestBodies.push(JSON.parse(raw) as Record<string, unknown>)
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
    const fp = chatRequestBodies[0]?.forwardedProps as
      | Record<string, unknown>
      | undefined
    expect(fp).toBeDefined()
    // The per-call body landed on the wire…
    expect(fp!.perCallBodyMarker).toBe(testId)
    // …merged with — not replacing — the chat-level `body` keys.
    expect(fp!.provider).toBe('openai')
    expect(fp!.feature).toBe('chat')
    expect(fp!.testId).toBe(testId)
  })
})
