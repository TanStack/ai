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
//
// aimock matches each fixture purely on userMessage text and discards
// `previous_interaction_id` when it normalises the request to the OpenAI
// canonical shape. That means a spec that only asserts on response text would
// pass even if the route silently dropped the id on turn 2. To actually
// exercise the chaining behaviour we capture the page → /api/chat POST bodies
// and assert that turn 2 forwarded the id captured from turn 1.
for (const provider of providersFor('stateful-interactions')) {
  test.describe(`${provider} — stateful-interactions`, () => {
    test('two-turn conversation chained via previous_interaction_id', async ({
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

      // Turn 1 must not carry a previousInteractionId (it's a fresh
      // interaction); turn 2 must carry the id surfaced by the gemini.interactionId
      // CUSTOM event from turn 1. useChat marshals the `body:` keys onto the
      // wire under `forwardedProps`.
      expect(chatRequestBodies).toHaveLength(2)
      const fp0 = chatRequestBodies[0]?.forwardedProps as
        | Record<string, unknown>
        | undefined
      const fp1 = chatRequestBodies[1]?.forwardedProps as
        | Record<string, unknown>
        | undefined
      expect(fp0?.previousInteractionId).toBeUndefined()
      expect(fp1?.previousInteractionId).toBe(interactionId)
    })
  })
}
