import { test, expect } from './fixtures'

/**
 * Wire-format verification for Gemini-native `modelOptions` on the image
 * generation path (fix/gemini-native-image-model-options).
 *
 * `/api/gemini-native-image-wire` drives `generateImage()` against
 * `gemini-2.5-flash-image` with `modelOptions: { safetySettings,
 * thinkingConfig }`. That request lands on `geminiNativeImageMount` in
 * global-setup.ts, which reads the raw, untranslated request body (aimock's
 * own journal normalises this endpoint's requests and drops these exact
 * fields before journalling — see that mount's comment) and rejects with 400
 * unless `safetySettings` is present at the request root,
 * `generationConfig.thinkingConfig` is present nested under
 * `generationConfig`, and no Imagen-only field (`personGeneration`,
 * `negativePrompt`, a root-level `aspectRatio`, …) appears anywhere in the
 * body.
 *
 * Before the fix, `generateWithGeminiApi` only forwarded `modelOptions.seed`
 * — `safetySettings` and `thinkingConfig` were silently dropped even though
 * the adapter's own provider-options type already declared them. Reverting
 * the fix reproduces that: the outgoing request loses both fields, the mount
 * rejects it with 400, `client.models.generateContent()` throws, and the
 * route returns `ok: false` — this spec's `ok` assertion fails.
 */
test.describe('gemini native image — modelOptions reach the generateContent wire', () => {
  test('safetySettings and thinkingConfig survive to the request; no Imagen field does', async ({
    request,
  }) => {
    const res = await request.post('/api/gemini-native-image-wire')
    expect(res.ok()).toBe(true)

    const { ok, images, error } = (await res.json()) as {
      ok: boolean
      images?: number
      error?: string
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(images).toBe(1)
  })
})
