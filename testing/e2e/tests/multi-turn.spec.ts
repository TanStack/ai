import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('multi-turn')) {
  test.describe(`${provider} — multi-turn`, () => {
    test('handles a multi-turn conversation', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(featureUrl(provider, 'multi-turn', testId, aimockPort))

      await sendMessage(page, '[multiturn-1] what guitars do you have')
      await waitForResponse(page)
      const firstResponse = await getLastAssistantMessage(page)
      expect(firstResponse).toContain('Fender Stratocaster')

      await sendMessage(page, '[multiturn-2] tell me about the cheapest one')
      await waitForResponse(page)
      const secondResponse = await getLastAssistantMessage(page)
      expect(secondResponse).toContain('$1,299')
    })
  })
}
