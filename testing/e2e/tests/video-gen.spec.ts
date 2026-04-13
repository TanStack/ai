import { test, expect } from './fixtures'
import {
  fillPrompt,
  clickGenerate,
  waitForGenerationComplete,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('video-gen')) {
  test.describe(`${provider} -- video-gen`, () => {
    test('sse -- generates video via SSE connection', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'video-gen', testId, aimockPort, 'sse'),
      )
      await fillPrompt(page, 'a guitar being played in a store')
      await clickGenerate(page)
      await waitForGenerationComplete(page, 60_000)
      const video = page.getByTestId('generated-video')
      await expect(video).toBeVisible()
    })

    test('http-stream -- generates video via HTTP stream', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'video-gen', testId, aimockPort, 'http-stream'),
      )
      await fillPrompt(page, 'a guitar being played in a store')
      await clickGenerate(page)
      await waitForGenerationComplete(page, 60_000)
      const video = page.getByTestId('generated-video')
      await expect(video).toBeVisible()
    })

    test('fetcher -- generates video via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'video-gen', testId, aimockPort, 'fetcher'),
      )
      await fillPrompt(page, 'a guitar being played in a store')
      await clickGenerate(page)
      await waitForGenerationComplete(page, 60_000)
      const video = page.getByTestId('generated-video')
      await expect(video).toBeVisible()
    })
  })
}
