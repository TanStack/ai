import { test, expect } from './fixtures'
import {
  fillPrompt,
  clickGenerate,
  waitForGenerationComplete,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('image-gen')) {
  test.describe(`${provider} -- image-gen`, () => {
    test('sse -- generates images via SSE connection', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'image-gen', testId, aimockPort, 'sse'),
      )
      await fillPrompt(page, 'a guitar in a music store')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const images = page.getByTestId('generated-image')
      await expect(images).toHaveCount(1)
    })

    test('http-stream -- generates images via HTTP stream', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'image-gen', testId, aimockPort, 'http-stream'),
      )
      await fillPrompt(page, 'a guitar in a music store')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const images = page.getByTestId('generated-image')
      await expect(images).toHaveCount(1)
    })

    test('fetcher -- generates images via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'image-gen', testId, aimockPort, 'fetcher'),
      )
      await fillPrompt(page, 'a guitar in a music store')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const images = page.getByTestId('generated-image')
      await expect(images).toHaveCount(1)
    })
  })
}
