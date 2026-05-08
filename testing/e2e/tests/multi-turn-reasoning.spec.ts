import { test, expect } from './fixtures'
import {
  featureUrl,
  sendMessage,
  waitForAssistantText,
  waitForResponse,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('multi-turn-reasoning')) {
  test.describe(`${provider} — multi-turn-reasoning`, () => {
    test('shows reasoning before each model turn in a multi-turn tool conversation', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'multi-turn-reasoning', testId, aimockPort),
      )

      await sendMessage(
        page,
        '[multi-turn-reasoning] recommend a beginner guitar',
      )
      await waitForResponse(page)
      await waitForAssistantText(page, 'Fender Stratocaster')

      const thinkingBlocks = page.getByTestId('thinking-block')
      await expect
        .poll(async () => (await thinkingBlocks.allInnerTexts()).join(' '))
        .toContain('inventory')

      await sendMessage(
        page,
        '[multi-turn-reasoning-followup] compare cheapest and premium',
      )
      await waitForResponse(page)
      await waitForAssistantText(page, 'Taylor 814ce')

      await expect
        .poll(async () => (await thinkingBlocks.allInnerTexts()).join(' '))
        .toContain('Taylor 814ce')
    })
  })
}
