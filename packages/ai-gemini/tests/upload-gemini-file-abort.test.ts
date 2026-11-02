import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadGeminiFile } from '../src/files'
import type * as Utils from '../src/utils'

const mocks = vi.hoisted(() => ({ upload: vi.fn(), get: vi.fn() }))

vi.mock('../src/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof Utils>()),
  createGeminiClient: () => ({
    files: { upload: mocks.upload, get: mocks.get },
  }),
}))

/** Resolves never; rejects with the reason when `signal` aborts. */
function untilAbort(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    })
  })
}

describe('uploadGeminiFile abortSignal', () => {
  beforeEach(() => {
    mocks.upload.mockReset()
    mocks.get.mockReset()
    mocks.upload.mockResolvedValue({ name: 'files/a', state: 'PROCESSING' })
    mocks.get.mockImplementation(
      (params: { config?: { abortSignal?: AbortSignal } }) =>
        untilAbort(params.config?.abortSignal),
    )
  })

  it('stops the wait between polls', async () => {
    const controller = new AbortController()
    const pending = uploadGeminiFile(new Blob(['x']), {
      apiKey: 'k',
      mimeType: 'video/mp4',
      pollIntervalMs: 60_000,
      abortSignal: controller.signal,
    })
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalled())
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('passes the signal to the status request', async () => {
    const controller = new AbortController()
    const pending = uploadGeminiFile(new Blob(['x']), {
      apiKey: 'k',
      mimeType: 'video/mp4',
      pollIntervalMs: 1,
      abortSignal: controller.signal,
    })
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalled())
    expect(mocks.get.mock.calls[0]![0].config.abortSignal).toBe(
      controller.signal,
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('sends no signal when none is set', async () => {
    mocks.upload.mockResolvedValue({
      name: 'files/a',
      state: 'ACTIVE',
      uri: 'https://x/files/a',
    })
    await uploadGeminiFile(new Blob(['x']), {
      apiKey: 'k',
      mimeType: 'video/mp4',
    })
    expect(mocks.upload).toHaveBeenCalledWith({
      file: expect.any(Blob),
      config: { mimeType: 'video/mp4' },
    })
  })
})
