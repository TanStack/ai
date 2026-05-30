import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('chat')) {
  test.describe(`${provider} — chat`, () => {
    test('sends a message and receives a streaming response', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(featureUrl(provider, 'chat', testId, aimockPort))

      await sendMessage(page, '[chat] recommend a guitar')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
    })
  })
}

test.describe('openai chat persistence', () => {
  test('persists chat messages across browser reload with localStorage', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(
      `${featureUrl('openai', 'chat', testId, aimockPort)}&persistence=localStorage`,
    )

    await sendMessage(page, '[chat] recommend a guitar')
    await waitForResponse(page)

    await expect(page.getByTestId('user-message')).toContainText(
      '[chat] recommend a guitar',
    )
    await expect(page.getByTestId('assistant-message')).toContainText(
      'Fender Stratocaster',
    )

    await page.reload()

    await expect(page.getByTestId('user-message')).toContainText(
      '[chat] recommend a guitar',
    )
    await expect(page.getByTestId('assistant-message')).toContainText(
      'Fender Stratocaster',
    )
  })
})
