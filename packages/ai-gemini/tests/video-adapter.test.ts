import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  GeminiVideoAdapter,
  createGeminiVideo,
  geminiVideo,
} from '../src/adapters/video'
import {
  GEMINI_VIDEO_DURATIONS,
  getGeminiVideoDurationOptions,
} from '../src/video/video-provider-options'
import type { GenerateVideosOperation, GoogleGenAI } from '@google/genai'
import type { GeminiVideoModel } from '../src/video/video-provider-options'

const testLogger = resolveDebugOption(false)

interface ClientStub {
  models: { generateVideos: ReturnType<typeof vi.fn> }
  operations: { getVideosOperation: ReturnType<typeof vi.fn> }
}

function createClientStub(
  overrides: {
    createResult?: Partial<GenerateVideosOperation>
    pollResult?: Partial<GenerateVideosOperation>
  } = {},
): ClientStub {
  return {
    models: {
      generateVideos: vi.fn().mockResolvedValue(
        overrides.createResult ?? {
          name: 'models/veo-3.1-generate-preview/operations/op-123',
        },
      ),
    },
    operations: {
      getVideosOperation: vi.fn().mockResolvedValue(
        overrides.pollResult ?? {
          name: 'models/veo-3.1-generate-preview/operations/op-123',
          done: true,
          response: {
            generatedVideos: [
              { video: { uri: 'https://example.com/video.mp4' } },
            ],
          },
        },
      ),
    },
  }
}

/**
 * Test subclass that injects a stubbed GoogleGenAI client through the
 * protected `client` seam instead of patching globals.
 */
class StubbedGeminiVideoAdapter<
  TModel extends GeminiVideoModel,
> extends GeminiVideoAdapter<TModel> {
  constructor(model: TModel, stub: ClientStub) {
    super({ apiKey: 'test-key' }, model)
    this.client = stub as unknown as GoogleGenAI
  }
}

describe('Gemini Video Adapter', () => {
  describe('factories', () => {
    it('creates an adapter with the provided API key', () => {
      const adapter = createGeminiVideo('veo-3.1-generate-preview', 'test-key')
      expect(adapter).toBeInstanceOf(GeminiVideoAdapter)
      expect(adapter.kind).toBe('video')
      expect(adapter.name).toBe('gemini')
      expect(adapter.model).toBe('veo-3.1-generate-preview')
    })

    it('geminiVideo throws without an API key in the environment', () => {
      const googleKey = process.env.GOOGLE_API_KEY
      const geminiKey = process.env.GEMINI_API_KEY
      delete process.env.GOOGLE_API_KEY
      delete process.env.GEMINI_API_KEY
      try {
        expect(() => geminiVideo('veo-3.1-generate-preview')).toThrow(
          /GOOGLE_API_KEY or GEMINI_API_KEY/,
        )
      } finally {
        if (googleKey !== undefined) process.env.GOOGLE_API_KEY = googleKey
        if (geminiKey !== undefined) process.env.GEMINI_API_KEY = geminiKey
      }
    })
  })

  describe('availableDurations', () => {
    it('returns the discrete Veo 3.x duration set', () => {
      const adapter = createGeminiVideo(
        'veo-3.1-lite-generate-preview',
        'test-key',
      )
      expect(adapter.availableDurations()).toEqual({
        kind: 'discrete',
        values: [4, 6, 8],
      })
    })

    it('covers every model in the duration table', () => {
      for (const model of Object.keys(
        GEMINI_VIDEO_DURATIONS,
      ) as Array<GeminiVideoModel>) {
        expect(getGeminiVideoDurationOptions(model).kind).toBe('discrete')
      }
    })
  })

  describe('snapDuration', () => {
    it('snaps to the closest valid duration', () => {
      const adapter = createGeminiVideo(
        'veo-3.1-lite-generate-preview',
        'test-key',
      )
      expect(adapter.snapDuration(3)).toBe(4)
      expect(adapter.snapDuration(5)).toBe(4)
      expect(adapter.snapDuration(7)).toBe(6)
      expect(adapter.snapDuration(100)).toBe(8)
    })
  })

  describe('per-model duration typing', () => {
    it('types duration as the model-specific union at compile time', () => {
      const veo3 = createGeminiVideo(
        'veo-3.1-lite-generate-preview',
        'test-key',
      )
      expectTypeOf(veo3.snapDuration).returns.toEqualTypeOf<
        4 | 6 | 8 | undefined
      >()
      type Veo3Options = Parameters<typeof veo3.createVideoJob>[0]
      expectTypeOf<Veo3Options['duration']>().toEqualTypeOf<
        4 | 6 | 8 | undefined
      >()
    })
  })

  describe('createVideoJob', () => {
    it('starts a long-running operation and returns its name as jobId', async () => {
      const stub = createClientStub()
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      const result = await adapter.createVideoJob({
        model: 'veo-3.1-generate-preview',
        prompt: 'a guitar being played in a store',
        size: '16:9',
        duration: 6,
        modelOptions: { negativePrompt: 'blurry footage' },
        logger: testLogger,
      })

      expect(result).toEqual({
        jobId: 'models/veo-3.1-generate-preview/operations/op-123',
        model: 'veo-3.1-generate-preview',
      })
      expect(stub.models.generateVideos).toHaveBeenCalledWith({
        model: 'veo-3.1-generate-preview',
        prompt: 'a guitar being played in a store',
        config: {
          negativePrompt: 'blurry footage',
          aspectRatio: '16:9',
          durationSeconds: 6,
        },
      })
    })

    it('omits aspectRatio and durationSeconds when size/duration are not given', async () => {
      const stub = createClientStub()
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-lite-generate-preview',
        stub,
      )

      await adapter.createVideoJob({
        model: 'veo-3.1-lite-generate-preview',
        prompt: 'a sunset',
        logger: testLogger,
      })

      expect(stub.models.generateVideos).toHaveBeenCalledWith({
        model: 'veo-3.1-lite-generate-preview',
        prompt: 'a sunset',
        config: {},
      })
    })

    it('throws when the operation comes back without a name', async () => {
      const stub = createClientStub({ createResult: {} })
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-lite-generate-preview',
        stub,
      )

      await expect(
        adapter.createVideoJob({
          model: 'veo-3.1-lite-generate-preview',
          prompt: 'a sunset',
          logger: testLogger,
        }),
      ).rejects.toThrow(/operation name/)
    })
  })

  describe('multimodal prompt routing', () => {
    const dataImage = (role?: 'start_frame' | 'end_frame' | 'reference') =>
      ({
        type: 'image',
        source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/jpeg' },
        ...(role && { metadata: { role } }),
      }) as const

    it('routes an un-roled image part to the input image', async () => {
      const stub = createClientStub()
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      await adapter.createVideoJob({
        model: 'veo-3.1-generate-preview',
        prompt: [
          { type: 'text', content: 'animate this product photo' },
          dataImage(),
        ],
        logger: testLogger,
      })

      expect(stub.models.generateVideos).toHaveBeenCalledWith({
        model: 'veo-3.1-generate-preview',
        prompt: 'animate this product photo',
        image: { imageBytes: 'aGVsbG8=', mimeType: 'image/jpeg' },
        config: {},
      })
    })

    it('routes end_frame and reference roles to lastFrame/referenceImages', async () => {
      const stub = createClientStub()
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      await adapter.createVideoJob({
        model: 'veo-3.1-generate-preview',
        prompt: [
          { type: 'text', content: 'pan from start to end' },
          dataImage('start_frame'),
          dataImage('end_frame'),
          dataImage('reference'),
        ],
        logger: testLogger,
      })

      const call = stub.models.generateVideos.mock.calls[0]?.[0]
      expect(call.image).toEqual({
        imageBytes: 'aGVsbG8=',
        mimeType: 'image/jpeg',
      })
      expect(call.config.lastFrame).toEqual({
        imageBytes: 'aGVsbG8=',
        mimeType: 'image/jpeg',
      })
      expect(call.config.referenceImages).toEqual([
        {
          image: { imageBytes: 'aGVsbG8=', mimeType: 'image/jpeg' },
          referenceType: 'ASSET',
        },
      ])
    })

    it('decodes base64 data: URI image sources', async () => {
      const stub = createClientStub()
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-lite-generate-preview',
        stub,
      )

      await adapter.createVideoJob({
        model: 'veo-3.1-lite-generate-preview',
        prompt: [
          { type: 'text', content: 'animate' },
          {
            type: 'image',
            source: { type: 'url', value: 'data:image/png;base64,aGVsbG8=' },
          },
        ],
        logger: testLogger,
      })

      const call = stub.models.generateVideos.mock.calls[0]?.[0]
      expect(call.image).toEqual({
        imageBytes: 'aGVsbG8=',
        mimeType: 'image/png',
      })
    })

    it('rejects multiple starting images', async () => {
      const stub = createClientStub()
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      await expect(
        adapter.createVideoJob({
          model: 'veo-3.1-generate-preview',
          prompt: [
            { type: 'text', content: 'animate' },
            dataImage(),
            dataImage(),
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/at most one starting image/)
    })

    it('rejects video prompt parts', async () => {
      const stub = createClientStub()
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      await expect(
        adapter.createVideoJob({
          model: 'veo-3.1-generate-preview',
          prompt: [
            { type: 'text', content: 'extend this' },
            {
              type: 'video',
              source: {
                type: 'data',
                value: 'aGVsbG8=',
                mimeType: 'video/mp4',
              },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/video prompt parts/)
    })
  })

  describe('getVideoStatus', () => {
    const jobId = 'models/veo-3.1-generate-preview/operations/op-123'

    it('polls the operation by job ID', async () => {
      const stub = createClientStub()
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      await adapter.getVideoStatus(jobId)

      const call = stub.operations.getVideosOperation.mock.calls[0]?.[0] as {
        operation: GenerateVideosOperation
      }
      expect(call.operation.name).toBe(jobId)
    })

    it('maps an in-flight operation to processing', async () => {
      const stub = createClientStub({
        pollResult: { name: jobId, done: false },
      })
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      expect(await adapter.getVideoStatus(jobId)).toEqual({
        jobId,
        status: 'processing',
      })
    })

    it('maps a completed operation with videos to completed', async () => {
      const stub = createClientStub()
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      expect(await adapter.getVideoStatus(jobId)).toEqual({
        jobId,
        status: 'completed',
      })
    })

    it('maps an operation error to failed with its message', async () => {
      const stub = createClientStub({
        pollResult: {
          name: jobId,
          done: true,
          error: { code: 3, message: 'Invalid duration' },
        },
      })
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      expect(await adapter.getVideoStatus(jobId)).toEqual({
        jobId,
        status: 'failed',
        error: 'Invalid duration',
      })
    })

    it('maps a fully RAI-filtered response to failed with the reasons', async () => {
      const stub = createClientStub({
        pollResult: {
          name: jobId,
          done: true,
          response: {
            generatedVideos: [],
            raiMediaFilteredCount: 1,
            raiMediaFilteredReasons: ['unsafe content'],
          },
        },
      })
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      const status = await adapter.getVideoStatus(jobId)
      expect(status.status).toBe('failed')
      expect(status.error).toContain('unsafe content')
    })
  })

  describe('getVideoUrl', () => {
    const jobId = 'models/veo-3.1-generate-preview/operations/op-123'

    it('returns the generated video URI', async () => {
      const stub = createClientStub()
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      expect(await adapter.getVideoUrl(jobId)).toEqual({
        jobId,
        url: 'https://example.com/video.mp4',
      })
    })

    it('throws when the operation is still running', async () => {
      const stub = createClientStub({
        pollResult: { name: jobId, done: false },
      })
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      await expect(adapter.getVideoUrl(jobId)).rejects.toThrow(/not ready/)
    })

    it('throws with the operation error message on failure', async () => {
      const stub = createClientStub({
        pollResult: {
          name: jobId,
          done: true,
          error: { code: 13, message: 'internal error' },
        },
      })
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      await expect(adapter.getVideoUrl(jobId)).rejects.toThrow(/internal error/)
    })

    it('throws with RAI reasons when every sample was filtered', async () => {
      const stub = createClientStub({
        pollResult: {
          name: jobId,
          done: true,
          response: {
            generatedVideos: [],
            raiMediaFilteredCount: 1,
            raiMediaFilteredReasons: ['unsafe content'],
          },
        },
      })
      const adapter = new StubbedGeminiVideoAdapter(
        'veo-3.1-generate-preview',
        stub,
      )

      await expect(adapter.getVideoUrl(jobId)).rejects.toThrow(/unsafe content/)
    })
  })
})
