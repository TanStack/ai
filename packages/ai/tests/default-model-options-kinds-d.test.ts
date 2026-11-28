import { describe, expect, it } from 'vitest'
import {
  BaseModel3dAdapter,
  generate3dModel,
  generate3dMotion,
} from '../src/index'
import { collectChunks } from './test-utils'
import type { Motion3dAdapter } from '../src/activities/generate3dMotion/adapter'
import type { GenerationMiddleware } from '../src/activities/middleware/types'
import type { Model3dGenerationOptions, Model3dResult } from '../src/types'

type Options = {
  quality?: string
  seed?: number
}

const defaults: Options = { quality: 'high', seed: 1 }

/** Records the `modelOptions` that the middleware context sees. */
function recordingMiddleware() {
  const seen: Array<unknown> = []
  const middleware: GenerationMiddleware = {
    onStart: (ctx) => void seen.push(ctx.modelOptions),
  }
  return { seen, middleware }
}

/** A 3D model provider stand-in that records each create request. */
class FakeModel3dAdapter extends BaseModel3dAdapter<'fake-model', Options> {
  readonly name = 'fake-3d'
  readonly defaultModelOptions: Options | undefined
  readonly received: Array<Options | undefined> = []

  constructor(defaultModelOptions: Options | undefined) {
    super({}, 'fake-model')
    this.defaultModelOptions = defaultModelOptions
  }

  async create3dModelJob(options: Model3dGenerationOptions<Options>) {
    this.received.push(options.modelOptions)
    return { jobId: 'job-1', model: this.model }
  }

  async get3dModelStatus(jobId: string) {
    return { jobId, status: 'completed' as const }
  }

  async get3dModel(jobId: string): Promise<Model3dResult> {
    return { jobId, url: 'https://cdn.example.com/m.glb', format: 'glb' }
  }
}

/** A motion provider stand-in that records each create request. */
function fakeMotionAdapter(defaultModelOptions: Options | undefined) {
  const received: Array<Options | undefined> = []
  const adapter: Motion3dAdapter<'motion-model', Options> = {
    kind: 'motion3d',
    name: 'fake-motion',
    model: 'motion-model',
    defaultModelOptions,
    '~types': { providerOptions: {} },
    create3dMotionJob: async (options) => {
      received.push(options.modelOptions)
      return { jobId: 'job-1', model: 'motion-model' }
    },
    get3dMotionStatus: async (jobId) => ({ jobId, status: 'completed' }),
    get3dMotion: async (jobId) => ({
      jobId,
      model: 'motion-model',
      assets: [{ url: 'https://cdn.example.com/m.fbx', format: 'fbx' }],
    }),
  }
  return { adapter, received }
}

/** Runs one call and returns what the adapter and the middleware saw. */
type Run = (
  defaultModelOptions: Options | undefined,
  modelOptions: Options | undefined,
) => Promise<{ adapter: unknown; middleware: unknown }>

const runModel3d: Run = async (defaultModelOptions, modelOptions) => {
  const adapter = new FakeModel3dAdapter(defaultModelOptions)
  const { seen, middleware } = recordingMiddleware()
  await generate3dModel({
    adapter,
    prompt: 'a small robot',
    threadId: 'thread-1',
    middleware: [middleware],
    debug: false,
    ...(modelOptions !== undefined ? { modelOptions } : {}),
  })
  return { adapter: adapter.received[0], middleware: seen[0] }
}

const runMotionSubmit: Run = async (defaultModelOptions, modelOptions) => {
  const { adapter, received } = fakeMotionAdapter(defaultModelOptions)
  const { seen, middleware } = recordingMiddleware()
  await generate3dMotion({
    adapter,
    prompt: 'axe swing',
    threadId: 'thread-1',
    middleware: [middleware],
    debug: false,
    ...(modelOptions !== undefined ? { modelOptions } : {}),
  })
  return { adapter: received[0], middleware: seen[0] }
}

const runMotionStream: Run = async (defaultModelOptions, modelOptions) => {
  const { adapter, received } = fakeMotionAdapter(defaultModelOptions)
  const { seen, middleware } = recordingMiddleware()
  await collectChunks(
    generate3dMotion({
      adapter,
      prompt: 'axe swing',
      threadId: 'thread-1',
      middleware: [middleware],
      debug: false,
      stream: true,
      pollingInterval: 0,
      ...(modelOptions !== undefined ? { modelOptions } : {}),
    }),
  )
  return { adapter: received[0], middleware: seen[0] }
}

describe.each([
  ['generate3dModel', runModel3d],
  ['generate3dMotion (submit)', runMotionSubmit],
  ['generate3dMotion (stream)', runMotionStream],
])('%s defaultModelOptions', (_name, run) => {
  it('sends the defaults to the adapter and the middleware', async () => {
    const seen = await run(defaults, undefined)
    expect(seen).toEqual({
      adapter: { quality: 'high', seed: 1 },
      middleware: { quality: 'high', seed: 1 },
    })
  })

  it('lets a call key win over the default key', async () => {
    const seen = await run(defaults, { seed: 7 })
    expect(seen).toEqual({
      adapter: { quality: 'high', seed: 7 },
      middleware: { quality: 'high', seed: 7 },
    })
  })

  it('leaves modelOptions as passed when the adapter has no defaults', async () => {
    const seen = await run(undefined, { seed: 7 })
    expect(seen).toEqual({ adapter: { seed: 7 }, middleware: { seed: 7 } })
  })
})
