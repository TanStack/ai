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
        expect(['discrete', 'range']).toContain(
          getGeminiVideoDurationOptions(model).kind,
        )
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

// ===========================
// Gemini Omni Flash (Interactions API)
// ===========================

interface InteractionsClientStub {
  interactions: {
    create: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
  }
}

const completedOmniInteraction = {
  id: 'v1_omni-job-123',
  status: 'completed',
  usage: {
    total_input_tokens: 12,
    total_output_tokens: 57920,
    total_tokens: 57932,
    output_tokens_by_modality: [{ modality: 'video', tokens: 57920 }],
  },
  steps: [
    { type: 'user_input', content: [{ type: 'text', text: 'a sunset' }] },
    { type: 'thought', signature: 'sig' },
    {
      type: 'model_output',
      content: [
        { type: 'video', mime_type: 'video/mp4', data: 'AAAAIGZ0eXA=' },
      ],
    },
  ],
}

function createInteractionsClientStub(
  overrides: {
    createResult?: Record<string, unknown>
    getResult?: Record<string, unknown>
  } = {},
): InteractionsClientStub {
  return {
    interactions: {
      create: vi.fn().mockResolvedValue(
        overrides.createResult ?? {
          id: 'v1_omni-job-123',
          status: 'in_progress',
          object: 'interaction',
        },
      ),
      get: vi
        .fn()
        .mockResolvedValue(overrides.getResult ?? completedOmniInteraction),
    },
  }
}

class StubbedGeminiOmniVideoAdapter extends GeminiVideoAdapter<'gemini-omni-flash-preview'> {
  constructor(stub: InteractionsClientStub) {
    super({ apiKey: 'test-key' }, 'gemini-omni-flash-preview')
    this.client = stub as unknown as GoogleGenAI
  }
}

describe('Gemini Omni Flash Video Adapter (Interactions API)', () => {
  describe('durations', () => {
    it('reports the 3-10 second range and clamps raw seconds into it', () => {
      const adapter = createGeminiVideo('gemini-omni-flash-preview', 'test-key')
      expect(adapter.availableDurations()).toEqual({
        kind: 'range',
        min: 3,
        max: 10,
        unit: 'seconds',
      })
      expect(adapter.snapDuration(1)).toBe(3)
      expect(adapter.snapDuration(7)).toBe(7)
      expect(adapter.snapDuration(60)).toBe(10)
    })

    it('types duration as number (continuous range) at compile time', () => {
      const omni = createGeminiVideo('gemini-omni-flash-preview', 'test-key')
      expectTypeOf(omni.snapDuration).returns.toEqualTypeOf<
        number | undefined
      >()
      type OmniOptions = Parameters<typeof omni.createVideoJob>[0]
      expectTypeOf<OmniOptions['duration']>().toEqualTypeOf<
        number | undefined
      >()
    })
  })

  describe('createVideoJob', () => {
    it('creates a background interaction requesting video output', async () => {
      const stub = createInteractionsClientStub()
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      const result = await adapter.createVideoJob({
        model: 'gemini-omni-flash-preview',
        prompt: 'a sunset over the ocean',
        size: '9:16',
        duration: 8,
        logger: testLogger,
      })

      expect(result).toEqual({
        jobId: 'v1_omni-job-123',
        model: 'gemini-omni-flash-preview',
      })
      expect(stub.interactions.create).toHaveBeenCalledWith({
        model: 'gemini-omni-flash-preview',
        input: [
          {
            type: 'user_input',
            content: [{ type: 'text', text: 'a sunset over the ocean' }],
          },
        ],
        response_modalities: ['video'],
        background: true,
        response_format: {
          type: 'video',
          aspect_ratio: '9:16',
          duration: '8s',
        },
      })
    })

    it('omits response_format when no size is given and passes modelOptions through', async () => {
      const stub = createInteractionsClientStub()
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      await adapter.createVideoJob({
        model: 'gemini-omni-flash-preview',
        prompt: 'make the violin invisible',
        modelOptions: { previous_interaction_id: 'v1_prior-turn' },
        logger: testLogger,
      })

      expect(stub.interactions.create).toHaveBeenCalledWith({
        model: 'gemini-omni-flash-preview',
        previous_interaction_id: 'v1_prior-turn',
        input: [
          {
            type: 'user_input',
            content: [{ type: 'text', text: 'make the violin invisible' }],
          },
        ],
        response_modalities: ['video'],
        background: true,
      })
    })

    it('sends image and video prompt parts as content blocks before the text', async () => {
      const stub = createInteractionsClientStub()
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      await adapter.createVideoJob({
        model: 'gemini-omni-flash-preview',
        prompt: [
          {
            type: 'image',
            source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
          },
          {
            type: 'video',
            source: {
              type: 'url',
              value:
                'https://generativelanguage.googleapis.com/v1beta/files/abc',
              mimeType: 'video/mp4',
            },
          },
          { type: 'text', content: 'animate this' },
        ],
        logger: testLogger,
      })

      expect(stub.interactions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          input: [
            {
              type: 'user_input',
              content: [
                { type: 'image', data: 'aGVsbG8=', mime_type: 'image/png' },
                {
                  type: 'video',
                  uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc',
                  mime_type: 'video/mp4',
                },
                { type: 'text', text: 'animate this' },
              ],
            },
          ],
        }),
      )
    })

    it('throws on audio prompt parts', async () => {
      const stub = createInteractionsClientStub()
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      await expect(
        adapter.createVideoJob({
          model: 'gemini-omni-flash-preview',
          prompt: [
            { type: 'text', content: 'sync to this' },
            {
              type: 'audio',
              source: {
                type: 'data',
                value: 'aGVsbG8=',
                mimeType: 'audio/wav',
              },
            },
          ],
          logger: testLogger,
        }),
      ).rejects.toThrow(/audio prompt parts/)
      expect(stub.interactions.create).not.toHaveBeenCalled()
    })

    it('throws when the interaction comes back without an id', async () => {
      const stub = createInteractionsClientStub({
        createResult: { status: 'in_progress' },
      })
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      await expect(
        adapter.createVideoJob({
          model: 'gemini-omni-flash-preview',
          prompt: 'a sunset',
          logger: testLogger,
        }),
      ).rejects.toThrow(/interaction id/)
    })
  })

  describe('getVideoStatus', () => {
    const jobId = 'v1_omni-job-123'

    it('maps in_progress to processing', async () => {
      const stub = createInteractionsClientStub({
        getResult: { id: jobId, status: 'in_progress' },
      })
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      expect(await adapter.getVideoStatus(jobId)).toEqual({
        jobId,
        status: 'processing',
      })
      expect(stub.interactions.get).toHaveBeenCalledWith(jobId)
    })

    it('maps a completed interaction with a video to completed', async () => {
      const stub = createInteractionsClientStub()
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      expect(await adapter.getVideoStatus(jobId)).toEqual({
        jobId,
        status: 'completed',
      })
    })

    it('maps a completed interaction without video output to failed', async () => {
      const stub = createInteractionsClientStub({
        getResult: {
          id: jobId,
          status: 'completed',
          steps: [
            {
              type: 'model_output',
              content: [{ type: 'text', text: 'cannot do that' }],
            },
          ],
        },
      })
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      const status = await adapter.getVideoStatus(jobId)
      expect(status.status).toBe('failed')
      expect(status.error).toMatch(/without returning a video/)
    })

    it('maps terminal non-success statuses to failed', async () => {
      for (const failure of ['failed', 'cancelled', 'incomplete']) {
        const stub = createInteractionsClientStub({
          getResult: { id: jobId, status: failure },
        })
        const adapter = new StubbedGeminiOmniVideoAdapter(stub)

        const status = await adapter.getVideoStatus(jobId)
        expect(status.status).toBe('failed')
        expect(status.error).toContain(failure)
      }
    })
  })

  describe('getVideoUrl', () => {
    const jobId = 'v1_omni-job-123'

    it('returns the inline base64 video as a data: URL with usage', async () => {
      const stub = createInteractionsClientStub()
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      expect(await adapter.getVideoUrl(jobId)).toEqual({
        jobId,
        url: 'data:video/mp4;base64,AAAAIGZ0eXA=',
        usage: {
          promptTokens: 12,
          completionTokens: 57920,
          totalTokens: 57932,
        },
      })
    })

    it('falls back to the video-modality token count when totals are missing', async () => {
      const stub = createInteractionsClientStub({
        getResult: {
          ...completedOmniInteraction,
          usage: {
            output_tokens_by_modality: [{ modality: 'video', tokens: 57920 }],
          },
        },
      })
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      const result = await adapter.getVideoUrl(jobId)
      expect(result.usage).toEqual({
        promptTokens: 0,
        completionTokens: 57920,
        totalTokens: 57920,
      })
    })

    it('passes a URI delivery through as the URL', async () => {
      const stub = createInteractionsClientStub({
        getResult: {
          id: jobId,
          status: 'completed',
          output_video: {
            type: 'video',
            uri: 'https://generativelanguage.googleapis.com/v1beta/files/xyz:download',
          },
        },
      })
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      const result = await adapter.getVideoUrl(jobId)
      expect(result.url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/files/xyz:download',
      )
    })

    it('throws when the interaction is still in progress', async () => {
      const stub = createInteractionsClientStub({
        getResult: { id: jobId, status: 'in_progress' },
      })
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      await expect(adapter.getVideoUrl(jobId)).rejects.toThrow(/not ready/)
    })

    it('throws with the terminal status on failure', async () => {
      const stub = createInteractionsClientStub({
        getResult: { id: jobId, status: 'failed' },
      })
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      await expect(adapter.getVideoUrl(jobId)).rejects.toThrow(/"failed"/)
    })

    it('throws when a completed interaction has no video content', async () => {
      const stub = createInteractionsClientStub({
        getResult: { id: jobId, status: 'completed', steps: [] },
      })
      const adapter = new StubbedGeminiOmniVideoAdapter(stub)

      await expect(adapter.getVideoUrl(jobId)).rejects.toThrow(
        /Video not found/,
      )
    })
  })
})
