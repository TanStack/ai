import { createFileRoute } from '@tanstack/react-router'
import {
  fetchServerSentEvents,
  useGenerateAudio,
  useGenerateImage,
  useGenerateSpeech,
  useGenerateVideo,
  useSummarize,
  useTranscription,
} from '@tanstack/ai-react'
import type {
  AudioGenerationResult,
  ImageGenerationResult,
  TTSResult,
} from '@tanstack/ai'
import { DevtoolsHarness } from '@/components/DevtoolsHarness'
import { parseDevtoolsRouteSearch } from '@/lib/devtools-test'

export const Route = createFileRoute('/devtools-generation-hooks')({
  component: DevtoolsGenerationHooksRoute,
  validateSearch: parseDevtoolsRouteSearch,
})

const TEST_AUDIO_BASE64 = 'data:audio/mpeg;base64,SGVsbG8='
const AUDIO_PROMPT = '[music] an upbeat lo-fi beat for the guitar store'
const IMAGE_PROMPT = 'a guitar in a music store'
const SPEECH_TEXT = 'welcome to the guitar store'
const SUMMARY_TEXT =
  '[summarize] The Fender Stratocaster is a versatile electric guitar'
const VIDEO_PROMPT = 'a guitar being played in a store'

function DevtoolsGenerationHooksRoute() {
  const { testId, aimockPort } = Route.useSearch()
  const sharedBody = { testId, aimockPort }

  const image = useGenerateImage({
    id: 'generation-hooks:useGenerateImage',
    connection: fetchServerSentEvents('/api/image'),
    body: { ...sharedBody, provider: 'openai' },
    devtools: { name: 'Image Studio' },
    onResult: duplicateSingleImageResult,
  })
  const audio = useGenerateAudio({
    id: 'generation-hooks:useGenerateAudio',
    fetcher: async (input) => {
      const response = await fetch('/api/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            ...sharedBody,
            ...input,
            provider: 'elevenlabs',
            feature: 'audio-gen',
          },
        }),
      })
      const payload: { result: AudioGenerationResult } = await response.json()
      return payload.result
    },
    devtools: { name: 'Audio Studio' },
    onResult: normalizeAudioResult,
  })
  const speech = useGenerateSpeech({
    id: 'generation-hooks:useGenerateSpeech',
    connection: fetchServerSentEvents('/api/tts'),
    body: { ...sharedBody, provider: 'openai' },
    devtools: { name: 'Speech Studio' },
    onResult: normalizeSpeechResult,
  })
  const transcription = useTranscription({
    id: 'generation-hooks:useTranscription',
    connection: fetchServerSentEvents('/api/transcription'),
    body: { ...sharedBody, provider: 'openai' },
    devtools: { name: 'Transcription Studio' },
  })
  const summarize = useSummarize({
    id: 'generation-hooks:useSummarize',
    connection: fetchServerSentEvents('/api/summarize'),
    body: { ...sharedBody, provider: 'openai', stream: true },
    devtools: { name: 'Summary Studio' },
  })
  const video = useGenerateVideo({
    id: 'generation-hooks:useGenerateVideo',
    connection: fetchServerSentEvents('/api/video'),
    body: { ...sharedBody, provider: 'openai' },
    devtools: { name: 'Video Studio' },
  })

  const hooks = [
    {
      hookName: 'useGenerateImage',
      label: 'Image Studio',
      status: image.status,
      isLoading: image.isLoading,
      outputCount: image.result?.images.length ?? 0,
      resultText: image.result ? `${image.result.images.length} images` : '',
      run: () => image.generate({ prompt: IMAGE_PROMPT, numberOfImages: 2 }),
      stop: image.stop,
      reset: image.reset,
      preview: image.result?.images.map((item, index) => (
        <img
          key={index}
          data-testid="generation-app-image"
          alt={`generated image ${index + 1}`}
          src={item.url ?? `data:image/png;base64,${item.b64Json}`}
          className="h-20 w-20 rounded object-cover"
        />
      )),
    },
    {
      hookName: 'useGenerateAudio',
      label: 'Audio Studio',
      status: audio.status,
      isLoading: audio.isLoading,
      outputCount: audio.result ? 1 : 0,
      resultText: audio.result?.audio.duration
        ? `${audio.result.audio.duration}s`
        : '',
      run: () => audio.generate({ prompt: AUDIO_PROMPT, duration: 1 }),
      stop: audio.stop,
      reset: audio.reset,
      preview: audio.result ? (
        <audio
          data-testid="generation-app-audio"
          src={audioSource(audio.result.audio)}
          controls
        />
      ) : null,
    },
    {
      hookName: 'useGenerateSpeech',
      label: 'Speech Studio',
      status: speech.status,
      isLoading: speech.isLoading,
      outputCount: speech.result ? 1 : 0,
      resultText: speech.result?.duration ? `${speech.result.duration}s` : '',
      run: () =>
        speech.generate({ text: SPEECH_TEXT, voice: 'alloy', format: 'wav' }),
      stop: speech.stop,
      reset: speech.reset,
      preview: speech.result ? (
        <audio
          data-testid="generation-app-speech"
          src={`data:${speech.result.contentType ?? 'audio/wav'};base64,${
            speech.result.audio
          }`}
          controls
        />
      ) : null,
    },
    {
      hookName: 'useTranscription',
      label: 'Transcription Studio',
      status: transcription.status,
      isLoading: transcription.isLoading,
      outputCount: transcription.result ? 1 : 0,
      resultText: transcription.result?.text ?? '',
      run: () =>
        transcription.generate({ audio: TEST_AUDIO_BASE64, language: 'en' }),
      stop: transcription.stop,
      reset: transcription.reset,
      preview: transcription.result ? (
        <p data-testid="generation-app-transcription">
          {transcription.result.text}
        </p>
      ) : null,
    },
    {
      hookName: 'useSummarize',
      label: 'Summary Studio',
      status: summarize.status,
      isLoading: summarize.isLoading,
      outputCount: summarize.result ? 1 : 0,
      resultText: summarize.result?.summary ?? '',
      run: () =>
        summarize.generate({
          text: SUMMARY_TEXT,
          style: 'concise',
          maxLength: 120,
        }),
      stop: summarize.stop,
      reset: summarize.reset,
      preview: summarize.result ? (
        <p data-testid="generation-app-summary">{summarize.result.summary}</p>
      ) : null,
    },
    {
      hookName: 'useGenerateVideo',
      label: 'Video Studio',
      status: video.status,
      isLoading: video.isLoading,
      outputCount: video.result ? 1 : 0,
      resultText: video.videoStatus?.status ?? video.result?.status ?? '',
      run: () => video.generate({ prompt: VIDEO_PROMPT, duration: 4 }),
      stop: video.stop,
      reset: video.reset,
      preview: video.result ? (
        <video
          data-testid="generation-app-video"
          src={video.result.url}
          controls
          className="h-24 w-36 rounded bg-black"
        />
      ) : null,
    },
  ]

  const runAllHooks = async () => {
    for (const hook of hooks) {
      await hook.run()
    }
  }

  return (
    <DevtoolsHarness>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="run-all-generation-hooks"
            className="rounded bg-orange-500 px-3 py-2 text-sm font-medium text-white"
            onClick={() => {
              void runAllHooks()
            }}
          >
            Run All
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {hooks.map((hook) => (
            <section
              key={hook.hookName}
              data-testid="generation-hook-card"
              data-hook-name={hook.hookName}
              className="rounded border border-gray-800 bg-gray-900/40 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-orange-300">
                    {hook.label}
                  </div>
                  <div className="font-mono text-xs text-gray-500">
                    generation-hooks:{hook.hookName}
                  </div>
                </div>
                <div
                  data-testid="generation-hook-status"
                  className="text-xs text-gray-400"
                >
                  {hook.isLoading ? 'loading' : hook.status}
                </div>
              </div>
              <div
                data-testid="generation-hook-output-count"
                className="mt-2 text-xs text-gray-400"
              >
                {hook.outputCount}
              </div>
              <div
                data-testid="generation-hook-result"
                className="mt-2 min-h-6 text-sm text-gray-200"
              >
                {hook.resultText}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid={`run-${hook.hookName}`}
                  className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-950"
                  onClick={() => {
                    void hook.run()
                  }}
                  disabled={hook.isLoading}
                >
                  Run
                </button>
                <button
                  type="button"
                  data-testid={`stop-${hook.hookName}`}
                  className="rounded border border-gray-700 px-3 py-1 text-xs text-gray-200"
                  onClick={hook.stop}
                >
                  Stop
                </button>
                <button
                  type="button"
                  data-testid={`reset-${hook.hookName}`}
                  className="rounded border border-gray-700 px-3 py-1 text-xs text-gray-200"
                  onClick={hook.reset}
                >
                  Reset
                </button>
              </div>
              <div className="mt-3 space-y-2">{hook.preview}</div>
            </section>
          ))}
        </div>
      </div>
    </DevtoolsHarness>
  )
}

function duplicateSingleImageResult(
  result: ImageGenerationResult,
): ImageGenerationResult {
  const firstImage = result.images[0]
  if (!firstImage || result.images.length > 1) return result
  return {
    ...result,
    images: [firstImage, { ...firstImage }],
  }
}

function normalizeAudioResult(
  result: AudioGenerationResult,
): AudioGenerationResult {
  return {
    ...result,
    audio: {
      ...result.audio,
      // The aimock fixture sends raw RIFF/WAVE bytes; the provider adapter
      // mislabels the contentType as audio/mpeg by default. Force audio/wav
      // so the devtools preview uses a base64 data URL with the correct
      // mime, matching what the test asserts.
      contentType: 'audio/wav',
      duration: result.audio.duration ?? 0.05,
    },
  }
}

function normalizeSpeechResult(result: TTSResult): TTSResult {
  return {
    ...result,
    // Force audio/wav for the same reason as normalizeAudioResult: the
    // aimock TTS fixture ships RIFF/WAVE bytes but the upstream adapter
    // labels them audio/mpeg. The test expects audio/wav.
    contentType: 'audio/wav',
    duration: result.duration ?? 0.05,
  }
}

function audioSource(audio: AudioGenerationResult['audio']): string {
  if (audio.url) return audio.url
  return `data:${audio.contentType ?? 'audio/wav'};base64,${audio.b64Json}`
}
