import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'

for (const provider of providers) {
  test.describe(`${provider} — chat`, () => {
    test('sends a message and receives a streaming response', async ({
      page,
    }) => {
      await page.goto(`/${provider}/chat`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessage(page, '[chat] recommend a guitar')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
    })
  })
}
