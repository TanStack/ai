import { test, expect } from './fixtures'

/**
 * Regression coverage for #1146 (Seedance 2.5 native 1080p). See
 * `api.byteplus-seedance-1080p-wire.ts` for the mechanism and
 * `byteplusSeedanceMount` in `global-setup.ts` for the mock that accepts the
 * create-task POST.
 */
test.describe('byteplus — Seedance 2.5 1080p wire (#1146)', () => {
  test('dreamina-seedance-2-5-260628 accepts 16:9_1080p and sends resolution 1080p', async ({
    request,
  }) => {
    const res = await request.post('/api/byteplus-seedance-1080p-wire')
    expect(res.ok()).toBe(true)

    const body = (await res.json()) as {
      ok: boolean
      error?: string
      jobId?: string
      model?: string
      resolution?: string
    }

    expect(body.error ?? null).toBeNull()
    expect(body.ok).toBe(true)
    expect(body.model).toBe('dreamina-seedance-2-5-260628')
    expect(body.resolution).toBe('1080p')
    expect(body.jobId).toEqual(expect.any(String))
  })
})
