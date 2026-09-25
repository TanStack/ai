import { test, expect } from './fixtures'

interface StageResult {
  imageCount?: number
  error?: string
}

interface GeminiImageGaModelsResponse {
  gaModelListed: boolean
  gaModel: StageResult
  legacyModel: StageResult
}

/**
 * Regression coverage for #1104 (Gemini GA image model ids + per-model
 * sizes). See `api.gemini-image-ga-models.ts` for the full mechanism and
 * `geminiNativeImageMount` in `global-setup.ts` for the mock that makes it
 * possible — aimock's native Gemini `generateContent` handler has no
 * image-response branch, so this route/mount pair exists specifically to
 * cover what aimock alone cannot. The route runs both model calls as
 * independent stages, so each test below only depends on its own stage.
 */
test.describe('gemini — GA image model ids and per-model sizes (#1104)', () => {
  test('gemini-3.1-flash-image is a listed GA id and generates an image', async ({
    request,
  }) => {
    const res = await request.post('/api/gemini-image-ga-models')
    expect(res.ok()).toBe(true)

    const { gaModelListed, gaModel } =
      (await res.json()) as GeminiImageGaModelsResponse

    // Genuine runtime data, not a type check: `GeminiImageModels` is the
    // package's exported `as const` array of supported image model ids.
    // Nothing at runtime gates request routing on this array (the adapter
    // dispatches on the model string's "gemini-" prefix, not membership), so
    // checking its contents is the only way to observe the id addition
    // without a TypeScript compile step. Before #1104 it only carried the
    // shut-down `gemini-3.1-flash-image-preview` alias.
    expect(gaModelListed).toBe(true)
    expect(gaModel.error ?? null).toBeNull()
    expect(gaModel.imageCount).toBe(1)
  })

  test('gemini-2.5-flash-image sends imageConfig.aspectRatio with no imageSize', async ({
    request,
  }) => {
    const res = await request.post('/api/gemini-image-ga-models')
    expect(res.ok()).toBe(true)

    const { legacyModel } = (await res.json()) as GeminiImageGaModelsResponse

    expect(legacyModel.error ?? null).toBeNull()
    expect(legacyModel.imageCount).toBe(1)
  })
})
