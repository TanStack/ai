import path from 'path'
import { fileURLToPath } from 'url'
import { test, expect } from './fixtures'
import {
  fillPrompt,
  clickGenerate,
  waitForGenerationComplete,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testImagePath = path.resolve(__dirname, '../test-assets/guitar-shop.png')

// Image-to-video: the prompt is sent as multimodal parts (text + attached
// image). For OpenAI/Sora the image part is uploaded as `input_reference`,
// which switches the SDK to a multipart POST /v1/videos — exercising the
// imagePartToFile conversion and job polling flow end-to-end.
for (const provider of providersFor('image-to-video')) {
  test.describe(`${provider} -- image-to-video`, () => {
    test('sse -- animates an image via SSE connection', async ({
      page,
      request,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'image-to-video', testId, aimockPort, 'sse'),
      )
      // Cold vite compiles of this route can delay hydration past fillPrompt's
      // fallback; wait for the page to settle before interacting.
      await page.waitForLoadState('networkidle')
      await fillPrompt(page, 'animate this product photo')
      await page.getByTestId('image-input').setInputFiles(testImagePath)
      await clickGenerate(page)
      await waitForGenerationComplete(page, 60_000)
      const video = page.getByTestId('generated-video')
      await expect(video).toBeVisible()

      // Prove the multipart POST /v1/videos round-tripped with the prompt
      // text intact — the SDK switches to multipart when `input_reference`
      // carries a File, and aimock extracts `prompt` from the form data.
      const journalRes = await request.get(
        `http://127.0.0.1:${aimockPort}/v1/_requests`,
      )
      const entries = (await journalRes.json()) as Array<{
        path?: string
        body?: unknown
      }>
      const videoEntry = entries.find(
        (e) =>
          e.path === '/v1/videos' &&
          JSON.stringify(e.body ?? '').includes('animate this product photo'),
      )
      expect(videoEntry).toBeTruthy()
    })

    test('http-stream -- animates an image via HTTP stream', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(
          provider,
          'image-to-video',
          testId,
          aimockPort,
          'http-stream',
        ),
      )
      // Cold vite compiles of this route can delay hydration past fillPrompt's
      // fallback; wait for the page to settle before interacting.
      await page.waitForLoadState('networkidle')
      await fillPrompt(page, 'animate this product photo')
      await page.getByTestId('image-input').setInputFiles(testImagePath)
      await clickGenerate(page)
      await waitForGenerationComplete(page, 60_000)
      const video = page.getByTestId('generated-video')
      await expect(video).toBeVisible()
    })

    test('fetcher -- animates an image via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'image-to-video', testId, aimockPort, 'fetcher'),
      )
      // Cold vite compiles of this route can delay hydration past fillPrompt's
      // fallback; wait for the page to settle before interacting.
      await page.waitForLoadState('networkidle')
      await fillPrompt(page, 'animate this product photo')
      await page.getByTestId('image-input').setInputFiles(testImagePath)
      await clickGenerate(page)
      await waitForGenerationComplete(page, 60_000)
      const video = page.getByTestId('generated-video')
      await expect(video).toBeVisible()
    })
  })
}
