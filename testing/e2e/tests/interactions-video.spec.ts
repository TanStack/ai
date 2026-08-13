import { test, expect } from './fixtures'
import {
  fillPrompt,
  clickGenerate,
  waitForGenerationComplete,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

// Gemini Omni Flash (gemini-omni-flash-preview) video generation over the
// Interactions API: create a background interaction → poll it by id →
// receive the finished clip as inline base64 the adapter surfaces as a
// data:video/mp4 URL. Backed by the geminiOmniVideoMount in global-setup.ts.
for (const provider of providersFor('interactions-video')) {
  test.describe(`${provider} -- interactions-video`, () => {
    test('sse -- generates video via SSE connection', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'interactions-video', testId, aimockPort, 'sse'),
      )
      await fillPrompt(page, 'a guitar being played in a store')
      await clickGenerate(page)
      await waitForGenerationComplete(page, 60_000)
      const video = page.getByTestId('generated-video')
      await expect(video).toBeVisible()
      await expect(video).toHaveAttribute('src', /^data:video\/mp4;base64,/)
    })

    test('http-stream -- generates video via HTTP stream', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(
          provider,
          'interactions-video',
          testId,
          aimockPort,
          'http-stream',
        ),
      )
      await fillPrompt(page, 'a guitar being played in a store')
      await clickGenerate(page)
      await waitForGenerationComplete(page, 60_000)
      const video = page.getByTestId('generated-video')
      await expect(video).toBeVisible()
      await expect(video).toHaveAttribute('src', /^data:video\/mp4;base64,/)
    })

    test('fetcher -- generates video via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(
          provider,
          'interactions-video',
          testId,
          aimockPort,
          'fetcher',
        ),
      )
      await fillPrompt(page, 'a guitar being played in a store')
      await clickGenerate(page)
      await waitForGenerationComplete(page, 60_000)
      const video = page.getByTestId('generated-video')
      await expect(video).toBeVisible()
      await expect(video).toHaveAttribute('src', /^data:video\/mp4;base64,/)
    })
  })
}
