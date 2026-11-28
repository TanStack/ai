import { describe, expect, it } from 'vitest'
import {
  generateAudio,
  generateSpeech,
  generateTranscription,
  generateVoice,
} from '../src/index'
import { collectChunks } from './test-utils'
import type { AudioAdapter } from '../src/activities/generateAudio/adapter'
import type { TTSAdapter } from '../src/activities/generateSpeech/adapter'
import type { TranscriptionAdapter } from '../src/activities/generateTranscription/adapter'
import type { VoiceAdapter } from '../src/activities/generateVoice/adapter'
import type { GenerationMiddleware } from '../src/activities/middleware'

type Opts = {
  temperature?: number
  provider?: { sort?: string; only?: Array<string> }
}

const defaults: Opts = {
  provider: { sort: 'latency', only: ['a'] },
  temperature: 0.2,
}

type RunOptions = {
  defaultModelOptions?: Opts
  modelOptions?: Opts
  stream?: boolean
}

// Each runner calls one activity with a fake adapter. It returns what the
// adapter got and what the generation middleware saw.
type Runner = (
  options: RunOptions,
  middleware: GenerationMiddleware,
  sent: Array<unknown>,
) => Promise<unknown>

const runners = {
  generateSpeech: (options, middleware, sent) => {
    const adapter: TTSAdapter<'tts-test', Opts> = {
      kind: 'tts',
      name: 'fake',
      model: 'tts-test',
      defaultModelOptions: options.defaultModelOptions,
      '~types': { providerOptions: {} },
      generateSpeech: async (call) => {
        sent.push(call.modelOptions)
        return { id: 's1', model: 'tts-test', audio: 'AAAA', format: 'mp3' }
      },
    }
    const base = {
      threadId: 'thread-1',
      adapter,
      text: 'hello',
      modelOptions: options.modelOptions,
      middleware: [middleware],
    }
    return options.stream
      ? collectChunks(generateSpeech({ ...base, stream: true }))
      : generateSpeech(base)
  },
  generateTranscription: (options, middleware, sent) => {
    const adapter: TranscriptionAdapter<'stt-test', Opts> = {
      kind: 'transcription',
      name: 'fake',
      model: 'stt-test',
      defaultModelOptions: options.defaultModelOptions,
      '~types': { providerOptions: {} },
      transcribe: async (call) => {
        sent.push(call.modelOptions)
        return { id: 't1', model: 'stt-test', text: 'hello' }
      },
    }
    return generateTranscription({
      threadId: 'thread-1',
      adapter,
      audio: 'AAAA',
      modelOptions: options.modelOptions,
      middleware: [middleware],
    })
  },
  generateAudio: (options, middleware, sent) => {
    const adapter: AudioAdapter<'audio-test', Opts> = {
      kind: 'audio',
      name: 'fake',
      model: 'audio-test',
      defaultModelOptions: options.defaultModelOptions,
      '~types': { providerOptions: {} },
      generateAudio: async (call) => {
        sent.push(call.modelOptions)
        return {
          id: 'a1',
          model: 'audio-test',
          audio: { url: 'https://example.com/a.mp3' },
        }
      },
    }
    return generateAudio({
      threadId: 'thread-1',
      adapter,
      prompt: 'a song',
      modelOptions: options.modelOptions,
      middleware: [middleware],
    })
  },
  generateVoice: (options, middleware, sent) => {
    const adapter: VoiceAdapter<'voice-test', Opts> = {
      kind: 'voice',
      name: 'fake',
      model: 'voice-test',
      defaultModelOptions: options.defaultModelOptions,
      '~types': { providerOptions: {} },
      generateVoice: async (call) => {
        sent.push(call.modelOptions)
        return { id: 'v1', model: 'voice-test', voices: [] }
      },
    }
    return generateVoice({
      threadId: 'thread-1',
      adapter,
      prompt: 'a warm voice',
      modelOptions: options.modelOptions,
      middleware: [middleware],
    })
  },
} satisfies Record<string, Runner>

async function run(runner: Runner, options: RunOptions) {
  const sent: Array<unknown> = []
  const seen: Array<unknown> = []
  const middleware: GenerationMiddleware = {
    name: 'test/default-model-options',
    onStart: (ctx) => {
      seen.push(ctx.modelOptions)
    },
  }
  await runner(options, middleware, sent)
  return { sent: sent[0], seen: seen[0] }
}

describe.each(Object.entries(runners))(
  '%s with adapter defaultModelOptions',
  (_name, runner) => {
    it('sends the defaults when the call sets no modelOptions', async () => {
      const { sent } = await run(runner, { defaultModelOptions: defaults })
      expect(sent).toEqual({
        provider: { sort: 'latency', only: ['a'] },
        temperature: 0.2,
      })
    })

    it('lets a call key replace the default key in full', async () => {
      const { sent } = await run(runner, {
        defaultModelOptions: defaults,
        modelOptions: { provider: { only: ['b'] } },
      })
      expect(sent).toEqual({ provider: { only: ['b'] }, temperature: 0.2 })
    })

    it('shows the merged value to the generation middleware', async () => {
      const { seen } = await run(runner, {
        defaultModelOptions: defaults,
        modelOptions: { temperature: 0.9 },
      })
      expect(seen).toEqual({
        provider: { sort: 'latency', only: ['a'] },
        temperature: 0.9,
      })
    })

    it('sends the call modelOptions unchanged when there are no defaults', async () => {
      const { sent } = await run(runner, { modelOptions: { temperature: 0.9 } })
      expect(sent).toEqual({ temperature: 0.9 })
    })
  },
)

describe('generateSpeech stream with adapter defaultModelOptions', () => {
  it('merges the defaults on the streaming path too', async () => {
    const { sent, seen } = await run(runners.generateSpeech, {
      defaultModelOptions: defaults,
      modelOptions: { temperature: 0.9 },
      stream: true,
    })
    const merged = {
      provider: { sort: 'latency', only: ['a'] },
      temperature: 0.9,
    }
    expect(sent).toEqual(merged)
    expect(seen).toEqual(merged)
  })
})
