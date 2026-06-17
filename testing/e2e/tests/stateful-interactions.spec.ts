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
//   2. The route threads that id back through the request body as
//      `previousInteractionId`, which api/chat translates into
//      `modelOptions.previous_interaction_id`. The adapter then sends only the
//      new user turn (not prior history), and aimock matches the second
//      fixture by userMessage.
//
// Test boundary: aimock matches fixtures purely by `userMessage` text and
// discards `previous_interaction_id` when normalising to the OpenAI canonical
// shape, so we can't observe the chained id at the aimock layer. The
// load-bearing assertion is on the page → /api/chat POST body: turn 2 must
// forward the id captured from turn 1's CUSTOM event. That covers:
//   - client: useChat → fetchServerSentEvents marshals `body` into the wire
//     under `forwardedProps`.
//   - the React example wires the CUSTOM event into state and back into body.
// The route's translation of `forwardedProps.previousInteractionId` into
// `modelOptions.previous_interaction_id`, and the adapter's wire-format
// translation of that into the Interactions API payload, are covered by unit
// tests in `packages/ai-gemini/tests/text-interactions-adapter.test.ts`.
for (const provider of providersFor('stateful-interactions')) {
  test.describe(`${provider} — stateful-interactions`, () => {
    // DISABLED — blocked on aimock. The gemini-upgrade branch migrated
    // `geminiTextInteractions` to the @google/genai v2 (SDK 2.x) Interactions
    // event protocol, which streams `step.start` / `step.delta` / `step.stop`
    // and `interaction.created` / `interaction.completed`. Every published
    // `@copilotkit/aimock` (≤1.31.0) still emits the SDK 1.x shapes
    // (`content.*` / `interaction.start` / `interaction.complete`), so the
    // adapter consumes none of the mock's deltas and the assistant message
    // comes back empty. This is a mock/adapter format mismatch, not an adapter
    // bug — 2.x behaviour is covered by unit tests in
    // packages/ai-gemini/tests/text-interactions-adapter.test.ts.
    //
    // Re-enable (test.fixme → test) once aimock emits SDK 2.x events. The exact
    // required event shapes and migration steps are documented in
    // ./stateful-interactions.AIMOCK-TODO.md
    test.fixme('two-turn conversation chained via previous_interaction_id', async ({
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
      // Tighten beyond "truthy" so an accidental "undefined"/"null" string
      // can't sneak past — the id is a non-trivial server-assigned token.
      expect(interactionId!.length).toBeGreaterThan(3)

      await sendMessage(page, '[stateful-2] tell me about the cheapest one')
      await waitForResponse(page)
      const secondResponse = await getLastAssistantMessage(page)
      expect(secondResponse).toContain('$1,299')

      // Turn 1 must not carry a previousInteractionId (it's a fresh
      // interaction); turn 2 must carry the id surfaced by the
      // gemini.interactionId CUSTOM event from turn 1. useChat marshals
      // the `body:` keys onto the wire under `forwardedProps`.
      expect(chatRequestBodies).toHaveLength(2)
      const fp0 = chatRequestBodies[0]?.forwardedProps as
        | Record<string, unknown>
        | undefined
      const fp1 = chatRequestBodies[1]?.forwardedProps as
        | Record<string, unknown>
        | undefined
      expect(fp0).toBeDefined()
      expect(fp1).toBeDefined()
      expect(fp0!.previousInteractionId).toBeUndefined()
      expect(fp1!.previousInteractionId).toBe(interactionId)
      // Sanity: the other forwardedProps keys must match across turns so a
      // regression that *replaced* turn 2's body with a different shape
      // (rather than adding the id) doesn't accidentally satisfy the
      // assertion above.
      expect(fp1!.provider).toBe(fp0!.provider)
      expect(fp1!.feature).toBe(fp0!.feature)
    })
  })
}
