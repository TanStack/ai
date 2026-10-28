import { test, expect } from './fixtures'
import { sendMessage, waitForResponse, featureUrl } from './helpers'
import { providersFor } from './test-matrix'

/**
 * Multi-turn structured chat — the pattern documented at
 * `docs/structured-outputs/multi-turn.md` and demonstrated by
 * `examples/ts-react-chat/src/routes/generations.structured-chat.tsx`.
 *
 * Per-turn assertions:
 * - Each user prompt produces a new assistant message with its own
 *   `structured-output` part attached (rendered as `structured-output-part`
 *   in the harness `ChatUI`).
 * - Older turns' parts stay renderable — turn N+1 must not clobber turn N.
 * - The hook-level `structured-output-complete` snapshot reflects only the
 *   latest turn's `data` (proving `final` derives from the most recent
 *   assistant message's part).
 *
 * Runs across every provider that supports both `multi-turn` and
 * `structured-output` — non-native-streaming providers (anthropic, gemini,
 * ollama) hit the `fallbackStructuredOutputStream` path, which still emits
 * one `structured-output.complete` per turn and lands a typed part on the
 * assistant message. The consumer code is identical across providers; the
 * test pins that down.
 */
for (const provider of providersFor('multi-turn-structured')) {
  test.describe(`${provider} — multi-turn-structured`, () => {
    test('every assistant turn keeps its own typed structured-output part', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'multi-turn-structured', testId, aimockPort),
      )

      // ---- Turn 1: pasta recipe lands as a structured-output part ----
      await sendMessage(
        page,
        '[multiturn-structured-1] pasta dinner for two under $15',
      )
      await waitForResponse(page)

      const partsAfterTurn1 = page.getByTestId('structured-output-part')
      await expect(partsAfterTurn1).toHaveCount(1)
      await expect(partsAfterTurn1.first()).toContainText('Pomodoro')
      await expect(partsAfterTurn1.first()).not.toContainText('Vegan')

      // Hook-level `final` reflects turn 1.
      const completeEl = page.getByTestId('structured-output-complete')
      await expect(completeEl).toBeAttached()
      const turn1Data = JSON.parse(
        (await completeEl.getAttribute('data-structured-output')) ?? '',
      )
      expect(turn1Data.title).toContain('Pomodoro')
      expect(turn1Data.title).not.toContain('Vegan')

      // ---- Turn 2: vegan variant — history must be preserved ----
      await sendMessage(page, '[multiturn-structured-2] now make it vegan')
      await waitForResponse(page)

      const partsAfterTurn2 = page.getByTestId('structured-output-part')
      await expect(partsAfterTurn2).toHaveCount(2)

      // Turn 1's part still holds the original recipe — must NOT have been
      // rewritten by the second run. This is the load-bearing assertion for
      // the "per-message structured-output part" design: a single hook-level
      // partial/final slot would have clobbered turn 1.
      await expect(partsAfterTurn2.nth(0)).toContainText('Pomodoro')
      await expect(partsAfterTurn2.nth(0)).not.toContainText('Vegan')

      // Turn 2's part has the new vegan variant.
      await expect(partsAfterTurn2.nth(1)).toContainText('Vegan')

      // `final` snapshot now reflects turn 2 only — proves the hook derives
      // from the latest assistant message's part, not from a sticky slot.
      const turn2Data = JSON.parse(
        (await completeEl.getAttribute('data-structured-output')) ?? '',
      )
      expect(turn2Data.title).toContain('Vegan')

      // ---- Turn 3: gluten-free + salad — three independent recipes ----
      await sendMessage(
        page,
        '[multiturn-structured-3] add a salad and make it gluten-free',
      )
      await waitForResponse(page)

      const partsAfterTurn3 = page.getByTestId('structured-output-part')
      await expect(partsAfterTurn3).toHaveCount(3)
      await expect(partsAfterTurn3.nth(0)).toContainText('Pomodoro')
      await expect(partsAfterTurn3.nth(0)).not.toContainText('Vegan')
      await expect(partsAfterTurn3.nth(1)).toContainText('Vegan')
      await expect(partsAfterTurn3.nth(1)).not.toContainText('Gluten-Free')
      await expect(partsAfterTurn3.nth(2)).toContainText('Gluten-Free')
      await expect(partsAfterTurn3.nth(2)).toContainText('Side Salad')

      const turn3Data = JSON.parse(
        (await completeEl.getAttribute('data-structured-output')) ?? '',
      )
      expect(turn3Data.title).toContain('Gluten-Free')
      // The schema is honored on every turn — `ingredients` is an array of
      // {item, amount}, even on the multi-ingredient salad turn.
      expect(Array.isArray(turn3Data.ingredients)).toBe(true)
      expect(turn3Data.ingredients.length).toBeGreaterThan(5)
    })
  })
}
