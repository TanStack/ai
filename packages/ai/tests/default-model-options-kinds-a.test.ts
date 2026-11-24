import { describe, expect, it } from 'vitest'
import { boolean, decide, embed, rerank, summarize } from '../src/index'
import { ChatStreamSummarizeAdapter } from '../src/activities/summarize/chat-stream-summarize'
import type { EmbeddingAdapter } from '../src/activities/embed/adapter'
import type {
  EvaluateAdapter,
  EvaluateOptions,
} from '../src/activities/evaluate/adapter'
import type { GenerationMiddleware } from '../src/activities/middleware/types'
import type { RerankAdapter } from '../src/activities/rerank/adapter'
import type { SummarizeAdapter } from '../src/activities/summarize/adapter'
import type { ChatStreamCapable } from '../src/activities/summarize/chat-stream-summarize'
import type {
  EmbeddingOptions,
  RerankOptions,
  SummarizationOptions,
  TextOptions,
} from '../src/types'

type ModelOptions = { mode?: string; level?: number; temperature?: number }

const defaults: ModelOptions = { mode: 'fast', level: 1 }
const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

/** What one activity run exposed: the adapter call and the middleware start. */
interface Seen {
  adapter: unknown
  middleware: unknown
}

interface RunInput {
  defaultModelOptions?: ModelOptions
  modelOptions?: ModelOptions
}

/** Middleware that keeps the `modelOptions` it saw on start. */
function startRecorder() {
  const seen: Array<unknown> = []
  const middleware: GenerationMiddleware = {
    name: 'start-recorder',
    onStart: (ctx) => {
      seen.push(ctx.modelOptions)
    },
  }
  return { seen, middleware }
}

async function runEmbed(input: RunInput): Promise<Seen> {
  const calls: Array<EmbeddingOptions<ModelOptions>> = []
  const adapter: EmbeddingAdapter<'fake-embed', ModelOptions> = {
    kind: 'embedding',
    name: 'fake',
    model: 'fake-embed',
    defaultModelOptions: input.defaultModelOptions,
    '~types': {
      providerOptions: {},
      modelProviderOptionsByName: {},
      modelInputModalitiesByName: {},
    },
    createEmbeddings: (options) => {
      calls.push(options)
      return Promise.resolve({
        id: 'e-1',
        model: options.model,
        embeddings: [{ vector: [0.5], index: 0 }],
      })
    },
  }
  const recorder = startRecorder()
  await embed({
    adapter,
    input: 'hello',
    modelOptions: input.modelOptions,
    middleware: [recorder.middleware],
  })
  return { adapter: calls[0]?.modelOptions, middleware: recorder.seen[0] }
}

async function runRerank(input: RunInput): Promise<Seen> {
  const calls: Array<RerankOptions<ModelOptions>> = []
  const adapter: RerankAdapter<'fake-rerank', ModelOptions> = {
    kind: 'rerank',
    name: 'fake',
    model: 'fake-rerank',
    defaultModelOptions: input.defaultModelOptions,
    '~types': { providerOptions: {} },
    rerank: (options) => {
      calls.push(options)
      return Promise.resolve({
        id: 'r-1',
        ranking: [{ index: 0, score: 1 }],
        usage,
      })
    },
  }
  const recorder = startRecorder()
  await rerank({
    adapter,
    query: 'q',
    documents: ['a'],
    modelOptions: input.modelOptions,
    middleware: [recorder.middleware],
  })
  return { adapter: calls[0]?.modelOptions, middleware: recorder.seen[0] }
}

async function runEvaluate(input: RunInput): Promise<Seen> {
  const calls: Array<EvaluateOptions<ModelOptions>> = []
  const adapter: EvaluateAdapter<'fake-evaluate', ModelOptions> = {
    kind: 'evaluate',
    name: 'fake',
    model: 'fake-evaluate',
    defaultModelOptions: input.defaultModelOptions,
    '~types': { providerOptions: {} },
    evaluate: (options) => {
      calls.push(options)
      return Promise.resolve({
        model: 'fake-evaluate',
        answers: { ok: { type: 'noul', noul: 0.9 } },
        usage,
      })
    },
  }
  const recorder = startRecorder()
  await decide({
    adapter,
    state: 'state',
    questions: { ok: boolean({ instructions: 'Is it ok?' }) },
    modelOptions: input.modelOptions,
    middleware: [recorder.middleware],
  })
  return { adapter: calls[0]?.modelOptions, middleware: recorder.seen[0] }
}

/** A summarize adapter with no `summarizeStream`, so streaming falls back. */
function fakeSummarizeAdapter(input: RunInput) {
  const calls: Array<SummarizationOptions<ModelOptions>> = []
  const adapter: SummarizeAdapter<'fake-summarize', ModelOptions> = {
    kind: 'summarize',
    name: 'fake',
    model: 'fake-summarize',
    defaultModelOptions: input.defaultModelOptions,
    '~types': { providerOptions: {} },
    summarize: (options) => {
      calls.push(options)
      return Promise.resolve({
        id: 's-1',
        model: 'fake-summarize',
        summary: 'short',
        usage,
      })
    },
  }
  return { adapter, calls }
}

async function runSummarize(input: RunInput): Promise<Seen> {
  const { adapter, calls } = fakeSummarizeAdapter(input)
  const recorder = startRecorder()
  await summarize({
    adapter,
    text: 'long text',
    threadId: 'thread-1',
    modelOptions: input.modelOptions,
    middleware: [recorder.middleware],
  })
  return { adapter: calls[0]?.modelOptions, middleware: recorder.seen[0] }
}

async function drain(stream: AsyncIterable<unknown>) {
  for await (const _chunk of stream) {
    // Read every chunk so the activity runs to the end.
  }
}

async function runSummarizeStreamFallback(input: RunInput): Promise<Seen> {
  const { adapter, calls } = fakeSummarizeAdapter(input)
  const recorder = startRecorder()
  await drain(
    summarize({
      adapter,
      text: 'long text',
      threadId: 'thread-1',
      stream: true,
      modelOptions: input.modelOptions,
      middleware: [recorder.middleware],
    }),
  )
  return { adapter: calls[0]?.modelOptions, middleware: recorder.seen[0] }
}

/** A text adapter that records what `chatStream` got and yields nothing. */
function fakeTextAdapter(defaultModelOptions: ModelOptions | undefined) {
  const calls: Array<TextOptions<ModelOptions>> = []
  const textAdapter: ChatStreamCapable<ModelOptions> = {
    defaultModelOptions,
    chatStream: (options) => {
      calls.push(options)
      return (async function* () {})()
    },
  }
  return { textAdapter, calls }
}

/**
 * Native streaming through `ChatStreamSummarizeAdapter`. The defaults live on
 * the wrapped text adapter. The wrapper adds its own `temperature: 0.3` when
 * the merged options have no `temperature`.
 */
async function runChatStreamSummarize(input: RunInput): Promise<Seen> {
  const { textAdapter, calls } = fakeTextAdapter(input.defaultModelOptions)
  const recorder = startRecorder()
  await drain(
    summarize({
      adapter: new ChatStreamSummarizeAdapter(textAdapter, 'fake-text'),
      text: 'long text',
      threadId: 'thread-1',
      stream: true,
      modelOptions: input.modelOptions,
      middleware: [recorder.middleware],
    }),
  )
  return { adapter: calls[0]?.modelOptions, middleware: recorder.seen[0] }
}

const kinds = [
  { kind: 'embed', run: runEmbed },
  { kind: 'rerank', run: runRerank },
  { kind: 'evaluate', run: runEvaluate },
  { kind: 'summarize', run: runSummarize },
  { kind: 'summarize stream fallback', run: runSummarizeStreamFallback },
]

describe.each(kinds)('$kind: adapter defaultModelOptions', ({ run }) => {
  it('sends the defaults to the adapter and the middleware', async () => {
    const seen = await run({ defaultModelOptions: defaults })
    expect(seen).toEqual({
      adapter: { mode: 'fast', level: 1 },
      middleware: { mode: 'fast', level: 1 },
    })
  })

  it('lets a call key replace the default key', async () => {
    const seen = await run({
      defaultModelOptions: defaults,
      modelOptions: { level: 2 },
    })
    expect(seen).toEqual({
      adapter: { mode: 'fast', level: 2 },
      middleware: { mode: 'fast', level: 2 },
    })
  })

  it('keeps the call modelOptions when the adapter has no defaults', async () => {
    const seen = await run({ modelOptions: { level: 2 } })
    expect(seen).toEqual({
      adapter: { level: 2 },
      middleware: { level: 2 },
    })
  })
})

describe('summarize with ChatStreamSummarizeAdapter', () => {
  it('exposes the text adapter defaults as its own', () => {
    const { textAdapter } = fakeTextAdapter(defaults)
    const adapter = new ChatStreamSummarizeAdapter(textAdapter, 'fake-text')
    expect(adapter.defaultModelOptions).toEqual({ mode: 'fast', level: 1 })
  })

  it('merges the text adapter defaults under the call modelOptions', async () => {
    const seen = await runChatStreamSummarize({
      defaultModelOptions: defaults,
      modelOptions: { level: 2 },
    })
    expect(seen).toEqual({
      adapter: { mode: 'fast', level: 2, temperature: 0.3 },
      middleware: { mode: 'fast', level: 2 },
    })
  })

  it('uses a default temperature from the text adapter over 0.3', async () => {
    const seen = await runChatStreamSummarize({
      defaultModelOptions: { temperature: 0.8 },
    })
    expect(seen).toEqual({
      adapter: { temperature: 0.8 },
      middleware: { temperature: 0.8 },
    })
  })

  it('keeps the call modelOptions when the text adapter has no defaults', async () => {
    const seen = await runChatStreamSummarize({ modelOptions: { level: 2 } })
    expect(seen).toEqual({
      adapter: { level: 2, temperature: 0.3 },
      middleware: { level: 2 },
    })
  })
})
