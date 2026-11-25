import { createSignal, flush } from 'solid-js'
import { renderHook } from '@solidjs/testing-library'
import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import type { ConnectConnectionAdapter } from '@tanstack/ai-client'
import { useGenerateImage } from '../src/use-generate-image'
import { useGenerateAudio } from '../src/use-generate-audio'
import { useGenerateSpeech } from '../src/use-generate-speech'
import { useTranscription } from '../src/use-transcription'
import { useSummarize } from '../src/use-summarize'
import { useGenerate3dModel } from '../src/use-generate-3d-model'

// Each specialised hook wraps useGeneration. A spread of the caller's options
// would freeze a `get body()` getter at setup time.
type Hook = (options: Record<string, unknown>) => {
  generate: (input: Record<string, unknown>) => Promise<void>
}

const hooks: Array<[string, Hook, Record<string, unknown>]> = [
  ['useGenerateImage', useGenerateImage as unknown as Hook, { prompt: 'p' }],
  ['useGenerateAudio', useGenerateAudio as unknown as Hook, { prompt: 'p' }],
  ['useGenerateSpeech', useGenerateSpeech as unknown as Hook, { text: 'p' }],
  ['useTranscription', useTranscription as unknown as Hook, { audio: 'p' }],
  ['useSummarize', useSummarize as unknown as Hook, { text: 'p' }],
  [
    'useGenerate3dModel',
    useGenerate3dModel as unknown as Hook,
    { prompt: 'p' },
  ],
]

describe('specialised generation hooks', () => {
  it.each(hooks)(
    '%s forwards a live body getter to the transport',
    async (_name, hook, input) => {
      const requests: Array<Record<string, unknown>> = []
      const connection: ConnectConnectionAdapter = {
        async *connect(_messages, data) {
          requests.push((data ?? {}) as Record<string, unknown>)
          yield { type: EventType.CUSTOM, name: 'generation:result', value: {} }
          yield { type: EventType.RUN_FINISHED, threadId: 'body', runId: 'run' }
        },
      }

      const rendered = renderHook(() => {
        const [model, setModel] = createSignal('first')
        const generation = hook({
          threadId: 'body',
          connection,
          get body() {
            return { model: model() }
          },
        })
        return { generation, setModel }
      })
      flush()

      await rendered.result.generation.generate(input)
      rendered.result.setModel('second')
      flush()
      await rendered.result.generation.generate(input)

      expect(requests).toHaveLength(2)
      expect(requests[0]).toMatchObject({ model: 'first' })
      expect(requests[1]).toMatchObject({ model: 'second' })
    },
  )
})
