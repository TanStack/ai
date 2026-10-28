import { test, expect } from './fixtures'

/**
 * Wire-format verification for Gemini-native image modelOptions on the
 * Interactions API.
 *
 * `/api/gemini-native-image-wire` generates with `safetySettings` and
 * `thinkingConfig.thinkingLevel`, then edits with `previous_interaction_id`.
 * `geminiNativeImageMount` 400s unless the first body has snake_case
 * `safety_settings` and `generation_config.thinking_level: "low"`, and the
 * second body chains without an image block. The two ids are the server
 * interaction ids.
 */
test.describe('gemini native image — modelOptions reach the Interactions wire', () => {
  test('safety settings, thinking level, and a chained edit survive', async ({
    request,
  }) => {
    const res = await request.post('/api/gemini-native-image-wire')
    expect(res.ok()).toBe(true)

    const { ok, images, editImages, firstId, editId, error } =
      (await res.json()) as {
        ok: boolean
        images?: number
        editImages?: number
        firstId?: string
        editId?: string
        error?: string
      }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(images).toBe(1)
    expect(editImages).toBe(1)
    expect(firstId).toBe('int_e2e_create')
    expect(editId).toBe('int_e2e_edit')
  })
})
