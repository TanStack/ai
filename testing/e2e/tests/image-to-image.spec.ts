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

// Image-conditioned generation: the prompt is sent as multimodal parts
// (text + attached image). For OpenAI this routes generateImage() to the
// multipart /v1/images/edits endpoint instead of /v1/images/generations,
// exercising the imagePartToFile upload path end-to-end.
for (const provider of providersFor('image-to-image')) {
  test.describe(`${provider} -- image-to-image`, () => {
    test('sse -- edits an image via SSE connection', async ({
      page,
      request,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'image-to-image', testId, aimockPort, 'sse'),
      )
      // Cold vite compiles of this route can delay hydration past fillPrompt's
      // fallback; wait for the page to settle before interacting.
      await page.waitForLoadState('networkidle')
      await fillPrompt(page, 'add a tree to this product photo')
      await page.getByTestId('image-input').setInputFiles(testImagePath)
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const images = page.getByTestId('generated-image')
      await expect(images).toHaveCount(1)

      // The fixture matches on prompt text regardless of endpoint, so also
      // prove the adapter routed to the multipart edits endpoint (and didn't
      // silently drop the image part and call /v1/images/generations).
      const journalRes = await request.get(
        `http://127.0.0.1:${aimockPort}/v1/_requests`,
      )
      const entries = (await journalRes.json()) as Array<{
        path?: string
        body?: unknown
      }>
      const editEntry = entries.find(
        (e) =>
          e.path === '/v1/images/edits' &&
          JSON.stringify(e.body ?? '').includes(
            'add a tree to this product photo',
          ),
      )
      expect(editEntry).toBeTruthy()
    })

    test('http-stream -- edits an image via HTTP stream', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(
          provider,
          'image-to-image',
          testId,
          aimockPort,
          'http-stream',
        ),
      )
      // Cold vite compiles of this route can delay hydration past fillPrompt's
      // fallback; wait for the page to settle before interacting.
      await page.waitForLoadState('networkidle')
      await fillPrompt(page, 'add a tree to this product photo')
      await page.getByTestId('image-input').setInputFiles(testImagePath)
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const images = page.getByTestId('generated-image')
      await expect(images).toHaveCount(1)
    })

    test('fetcher -- edits an image via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'image-to-image', testId, aimockPort, 'fetcher'),
      )
      // Cold vite compiles of this route can delay hydration past fillPrompt's
      // fallback; wait for the page to settle before interacting.
      await page.waitForLoadState('networkidle')
      await fillPrompt(page, 'add a tree to this product photo')
      await page.getByTestId('image-input').setInputFiles(testImagePath)
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const images = page.getByTestId('generated-image')
      await expect(images).toHaveCount(1)
    })
  })
}
