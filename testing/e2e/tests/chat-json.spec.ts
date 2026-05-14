import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

// Roundtrip coverage for toJSONResponse (server) ↔ fetchJSON (client).
// We only need one provider to confirm the buffered transport delivers the
// same chunks as the streaming path — the unit tests already cover edge
// cases on each side independently.
const provider = providersFor('chat')[0]!

test.describe(`${provider} — chat (toJSONResponse → fetchJSON roundtrip)`, () => {
  test('drains the chat stream into JSON and replays it on the client', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(featureUrl(provider, 'chat', testId, aimockPort, 'json'))

    await sendMessage(page, '[chat] recommend a guitar')
    await waitForResponse(page)

    const response = await getLastAssistantMessage(page)
    // Same fixture content as the SSE chat spec — the transport is the only
    // thing under test, so the assistant text should match exactly.
    expect(response).toContain('Fender Stratocaster')
  })
})
