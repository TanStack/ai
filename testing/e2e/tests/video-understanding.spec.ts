import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

// Agentic video understanding (geminiText). The route attaches a video content
// part flagged `processing: 'agentic'`, so the adapter routes the turn through
// Gemini's Interactions API instead of generateContent. aimock serves the
// synchronous interaction natively: it extracts the text prompt, ignores the
// video block, matches the fixture, and returns `output_text`.
//
// This is the integration assertion (the whole stack wires up and renders). The
// routing itself (interactions.create vs generateContentStream) is pinned by
// unit tests in `packages/ai-gemini/tests/agentic-video.test.ts`.
for (const provider of providersFor('video-understanding')) {
  test.describe(`${provider} -- video-understanding`, () => {
    test('answers a question about an attached video', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'video-understanding', testId, aimockPort),
      )

      await sendMessage(page, '[video-understanding] describe this video')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('guitar')
    })
  })
}
