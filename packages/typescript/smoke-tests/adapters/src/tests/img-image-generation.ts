import { generateImage } from '@tanstack/ai'
import { writeDebugFile } from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'

/**
 * IMG: Image Generation Test
 *
 * Tests image generation by providing a text prompt and
 * verifying we get valid image data back.
 *
 * NOTE: This test is skipped by default to avoid generating
 * images on every run. Use --tests img to run explicitly.
 */
export async function runIMG(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'img-image-generation'
  const adapterName = adapterContext.adapterName

  // Skip if no image adapter is available
  if (!adapterContext.imageAdapter) {
    console.log(`[${adapterName}] — ${testName}: Ignored (no image adapter)`)
    return { passed: true, ignored: true }
  }

  const model = adapterContext.imageModel || 'dall-e-3'
  const prompt = 'A simple red circle on a white background'

  const debugData: Record<string, any> = {
    adapter: adapterName,
    test: testName,
    model,
    timestamp: new Date().toISOString(),
    input: { prompt },
  }

  try {
    const result = await generateImage({
      adapter: adapterContext.imageAdapter,
      model,
      prompt,
      numberOfImages: 1,
      size: '1024x1024',
    })

    // Check that we got valid image data
    const images = result.images || []
    const hasImages = images.length > 0
    const hasValidImage = images.some(
      (img: any) =>
        (img.url && typeof img.url === 'string' && img.url.length > 0) ||
        (img.b64Json &&
          typeof img.b64Json === 'string' &&
          img.b64Json.length > 0),
    )

    const passed = hasImages && hasValidImage

    debugData.summary = {
      imageCount: images.length,
      hasUrl: images[0]?.url ? true : false,
      hasB64: images[0]?.b64Json ? true : false,
      // Don't log the actual image data, just metadata
      firstImageKeys: images[0] ? Object.keys(images[0]) : [],
    }
    debugData.result = {
      passed,
      error: passed
        ? undefined
        : hasImages
          ? 'Image data missing url or b64Json'
          : 'No images returned',
    }

    await writeDebugFile(adapterName, testName, debugData)

    console.log(
      `[${adapterName}] ${passed ? '✅' : '❌'} ${testName}${
        passed ? '' : `: ${debugData.result.error}`
      }`,
    )

    return { passed, error: debugData.result.error }
  } catch (error: any) {
    const message = error?.message || String(error)
    debugData.summary = { error: message }
    debugData.result = { passed: false, error: message }
    await writeDebugFile(adapterName, testName, debugData)
    console.log(`[${adapterName}] ❌ ${testName}: ${message}`)
    return { passed: false, error: message }
  }
}
