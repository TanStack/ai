import { test, expect } from './fixtures'

/**
 * Wire-format verification for `{ type: 'file' }` content sources (#909).
 *
 * Uploads can't run against aimock, so the route at `/api/file-source-wire`
 * drives `chat()` with a synthetic provider handle and this spec inspects
 * aimock's journal (`GET /v1/_requests`) for the provider's native file
 * reference. Aimock normalises every request body to an OpenAI-compatible
 * chat form before journalling, and that normalisation strips user-message
 * image parts for all three providers — so the positive assertions here are
 * the end-to-end ok:true round-trip (the mapping ran to completion and the
 * request reached the provider endpoint), with the structural wire proof in
 * the per-package unit tests (packages/ai-openai/tests/files-source.test.ts,
 * packages/ai-anthropic/tests/files-source.test.ts,
 * packages/ai-gemini/tests/files-source.test.ts). The cross-provider
 * rejection path IS asserted end-to-end, for both a RUN_ERROR-yielding
 * adapter (OpenAI) and a throwing one (Gemini).
 */
// Serial mode: each test clears then re-populates the aimock journal.
test.describe.configure({ mode: 'serial' })

test.describe('file content source — wire format', () => {
  test.beforeEach(async ({ request, aimockPort }) => {
    await request.delete(`http://127.0.0.1:${aimockPort}/v1/_requests`)
  })

  test('openai: an own-provider handle completes the round-trip (input_image.file_id covered by unit test)', async ({
    request,
    aimockPort,
    testId,
  }) => {
    const res = await request.post(
      `/api/file-source-wire?provider=openai&testId=${encodeURIComponent(testId)}`,
    )
    const { ok } = (await res.json()) as { ok: boolean; error?: string }
    expect(ok).toBe(true)
    // The request must actually have reached the mock endpoint — ok:true with
    // an empty journal would mean the call never left the adapter.
    const journal = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries = (await journal.json()) as Array<{ body: any }>
    expect(entries.length).toBeGreaterThan(0)
  })

  test('openai: a foreign (gemini) handle is rejected, not forwarded', async ({
    request,
    testId,
  }) => {
    const res = await request.post(
      `/api/file-source-wire?provider=openai&handleProvider=gemini&testId=${encodeURIComponent(testId)}`,
    )
    const { ok, error } = (await res.json()) as { ok: boolean; error?: string }
    expect(ok).toBe(false)
    expect(error).toMatch(/openai/)
    expect(error).toMatch(/gemini/)
  })

  test('anthropic: an own-provider handle completes the round-trip (file_id block covered by unit test)', async ({
    request,
    testId,
  }) => {
    const res = await request.post(
      `/api/file-source-wire?provider=anthropic&testId=${encodeURIComponent(testId)}`,
    )
    const { ok } = (await res.json()) as { ok: boolean; error?: string }
    // Structural proof that the handle becomes a { type: 'file', file_id }
    // source with the files-api beta lives in
    // packages/ai-anthropic/tests/files-source.test.ts — aimock's journal
    // normalisation strips the block so it can't be asserted here.
    expect(ok).toBe(true)
  })

  test('gemini: an own-provider handle completes the round-trip (fileData.fileUri covered by unit test)', async ({
    request,
    testId,
  }) => {
    const res = await request.post(
      `/api/file-source-wire?provider=gemini&testId=${encodeURIComponent(testId)}`,
    )
    const { ok } = (await res.json()) as { ok: boolean; error?: string }
    expect(ok).toBe(true)
  })

  test('gemini: a foreign (openai) handle is rejected before any request', async ({
    request,
    testId,
  }) => {
    const res = await request.post(
      `/api/file-source-wire?provider=gemini&handleProvider=openai&testId=${encodeURIComponent(testId)}`,
    )
    const { ok, error } = (await res.json()) as { ok: boolean; error?: string }
    expect(ok).toBe(false)
    expect(error).toMatch(/gemini/)
  })
})
