import { test, expect } from './fixtures'
import {
  fillTextInput,
  clickGenerate,
  waitForGenerationComplete,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('tts')) {
  test.describe(`${provider} -- tts`, () => {
    test('sse -- generates speech via SSE connection', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(featureUrl(provider, 'tts', testId, aimockPort, 'sse'))
      await fillTextInput(page, 'welcome to the guitar store')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })

    test('http-stream -- generates speech via HTTP stream', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'tts', testId, aimockPort, 'http-stream'),
      )
      await fillTextInput(page, 'welcome to the guitar store')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })

    test('fetcher -- generates speech via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'tts', testId, aimockPort, 'fetcher'),
      )
      await fillTextInput(page, 'welcome to the guitar store')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })
  })
}
