import { describe, expect, it } from 'vitest'
import { generateImage } from '../src/activities/generateImage/index'
import { BaseImageAdapter } from '../src/activities/generateImage/adapter'
import { generateVideo } from '../src/activities/generateVideo/index'
import { BaseVideoAdapter } from '../src/activities/generateVideo/adapter'
import { generateLiveVideo } from '../src/activities/generateLiveVideo/index'
import { BaseLiveVideoAdapter } from '../src/activities/generateLiveVideo/adapter'
import { generateWorld } from '../src/activities/generateWorld/index'
import { BaseWorldAdapter } from '../src/activities/generateWorld/adapter'
import { collectChunks } from './test-utils'
import type { GenerationMiddleware } from '../src/activities/middleware/types'
import type {
  ImageGenerationOptions,
  LiveVideoGenerationOptions,
  VideoGenerationOptions,
  WorldGenerationOptions,
} from '../src/types'

type FakeOptions = {
  quality?: string
  style?: { tone?: string; palette?: string }
}

const defaults: FakeOptions = {
  quality: 'low',
  style: { tone: 'warm', palette: 'pastel' },
}

/** Every `modelOptions` value the fake adapter and the middleware saw. */
type Seen = { sent: Array<unknown>; middleware: Array<unknown> }

function createSeen(): Seen {
  return { sent: [], middleware: [] }
}

function recordModelOptions(seen: Seen): GenerationMiddleware {
  return {
    name: 'test/record-model-options',
    onStart: (ctx) => {
      seen.middleware.push(ctx.modelOptions)
    },
  }
}

class FakeImageAdapter extends BaseImageAdapter<'fake-image', FakeOptions> {
  readonly name = 'fake'
  constructor(
    private readonly seen: Seen,
    readonly defaultModelOptions: FakeOptions | undefined,
  ) {
    super('fake-image')
  }
  async generateImages(options: ImageGenerationOptions<FakeOptions>) {
    this.seen.sent.push(options.modelOptions)
    return { id: 'img-1', model: 'fake-image', images: [{ url: 'u' }] }
  }
}

class FakeVideoAdapter extends BaseVideoAdapter<'fake-video', FakeOptions> {
  readonly name = 'fake'
  constructor(
    private readonly seen: Seen,
    readonly defaultModelOptions: FakeOptions | undefined,
  ) {
    super({}, 'fake-video')
  }
  async createVideoJob(options: VideoGenerationOptions<FakeOptions>) {
    this.seen.sent.push(options.modelOptions)
    return { jobId: 'job-1', model: 'fake-video' }
  }
  async getVideoStatus(jobId: string) {
    return { jobId, status: 'completed' as const }
  }
  async getVideo(jobId: string) {
    return { jobId, url: 'https://example.test/v.mp4' }
  }
}

class FakeLiveVideoAdapter extends BaseLiveVideoAdapter<
  'fake-live',
  FakeOptions
> {
  readonly name = 'fake'
  constructor(
    private readonly seen: Seen,
    readonly defaultModelOptions: FakeOptions | undefined,
  ) {
    super('fake-live')
  }
  async createLiveVideo(options: LiveVideoGenerationOptions<FakeOptions>) {
    this.seen.sent.push(options.modelOptions)
    return {
      id: 'live-1',
      model: 'fake-live',
      token: 't',
      expiresAt: 1,
      prompt: options.prompt,
      status: 'ready' as const,
    }
  }
}

class FakeWorldAdapter extends BaseWorldAdapter<'fake-world', FakeOptions> {
  readonly name = 'fake'
  constructor(
    private readonly seen: Seen,
    readonly defaultModelOptions: FakeOptions | undefined,
  ) {
    super('fake-world')
  }
  async createWorld(options: WorldGenerationOptions<FakeOptions>) {
    this.seen.sent.push(options.modelOptions)
    return {
      id: 'world-1',
      model: 'fake-world',
      prompt: options.prompt,
      status: 'ready' as const,
    }
  }
}

type Run = (
  defaultModelOptions: FakeOptions | undefined,
  modelOptions: FakeOptions | undefined,
) => Promise<Seen>

const runs: Array<[string, Run]> = [
  [
    'generateImage',
    async (defaultModelOptions, modelOptions) => {
      const seen = createSeen()
      await generateImage({
        adapter: new FakeImageAdapter(seen, defaultModelOptions),
        prompt: 'a cat',
        threadId: 'thread-1',
        modelOptions,
        middleware: [recordModelOptions(seen)],
      })
      return seen
    },
  ],
  [
    'generateVideo',
    async (defaultModelOptions, modelOptions) => {
      const seen = createSeen()
      await generateVideo({
        adapter: new FakeVideoAdapter(seen, defaultModelOptions),
        prompt: 'a cat',
        threadId: 'thread-1',
        modelOptions,
        middleware: [recordModelOptions(seen)],
      })
      return seen
    },
  ],
  [
    'generateVideo (stream)',
    async (defaultModelOptions, modelOptions) => {
      const seen = createSeen()
      await collectChunks(
        generateVideo({
          adapter: new FakeVideoAdapter(seen, defaultModelOptions),
          prompt: 'a cat',
          threadId: 'thread-1',
          modelOptions,
          middleware: [recordModelOptions(seen)],
          stream: true,
          pollingInterval: 1,
        }),
      )
      return seen
    },
  ],
  [
    'generateLiveVideo',
    async (defaultModelOptions, modelOptions) => {
      const seen = createSeen()
      await generateLiveVideo({
        adapter: new FakeLiveVideoAdapter(seen, defaultModelOptions),
        prompt: 'a cat',
        threadId: 'thread-1',
        modelOptions,
        middleware: [recordModelOptions(seen)],
      })
      return seen
    },
  ],
  [
    'generateWorld',
    async (defaultModelOptions, modelOptions) => {
      const seen = createSeen()
      await generateWorld({
        adapter: new FakeWorldAdapter(seen, defaultModelOptions),
        prompt: 'a city',
        threadId: 'thread-1',
        modelOptions,
        middleware: [recordModelOptions(seen)],
      })
      return seen
    },
  ],
]

describe.each(runs)('%s with adapter defaultModelOptions', (_name, run) => {
  it('sends the defaults when the call sets no modelOptions', async () => {
    const seen = await run(defaults, undefined)
    expect(seen.sent).toEqual([
      { quality: 'low', style: { tone: 'warm', palette: 'pastel' } },
    ])
  })

  it('lets a call key replace the default key in full', async () => {
    const seen = await run(defaults, { style: { tone: 'cold' } })
    expect(seen.sent).toEqual([{ quality: 'low', style: { tone: 'cold' } }])
  })

  it('shows the merged value to the generation middleware', async () => {
    const seen = await run(defaults, { quality: 'high' })
    expect(seen.middleware).toEqual([
      { quality: 'high', style: { tone: 'warm', palette: 'pastel' } },
    ])
  })

  it('sends the call modelOptions unchanged when there are no defaults', async () => {
    const seen = await run(undefined, { quality: 'high' })
    expect(seen.sent).toEqual([{ quality: 'high' }])
    expect(seen.middleware).toEqual([{ quality: 'high' }])
  })
})
