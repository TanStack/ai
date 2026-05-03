import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

// E2E coverage for Gemini's stateful Interactions API (geminiTextInteractions).
//
// Two-turn flow:
//   1. Issue a first chat call. The aimock fixture returns a server-assigned
//      interactionId in interaction.start. The adapter surfaces it via the
//      `gemini.interactionId` CUSTOM event, which the route stores in state
//      and renders into a hidden `gemini-interaction-id` element so this
//      spec can read it.
//   2. The route also threads that id back through the request body as
//      `previousInteractionId`, which api/chat translates into
//      `modelOptions.previous_interaction_id`. The adapter then sends only the
//      new user turn (not prior history), and aimock matches the second
//      fixture by userMessage.
for (const provider of providersFor('stateful-interactions')) {
  test.describe(`${provider} — stateful-interactions`, () => {
    test('two-turn conversation chained via previous_interaction_id', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'stateful-interactions', testId, aimockPort),
      )

      await sendMessage(page, '[stateful-1] what guitars do you have')
      await waitForResponse(page)
      const firstResponse = await getLastAssistantMessage(page)
      expect(firstResponse).toContain('Fender Stratocaster')

      const interactionIdEl = page.getByTestId('gemini-interaction-id')
      await interactionIdEl.waitFor({ state: 'attached' })
      const interactionId = (await interactionIdEl.textContent())?.trim()
      expect(interactionId).toBeTruthy()

      await sendMessage(page, '[stateful-2] tell me about the cheapest one')
      await waitForResponse(page)
      const secondResponse = await getLastAssistantMessage(page)
      expect(secondResponse).toContain('$1,299')
    })
  })
}
