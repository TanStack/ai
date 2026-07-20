import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  FileAudio,
  FileText,
  Image,
  Mic,
  Music,
  Play,
  RotateCcw,
  Video,
} from 'lucide-react'
import {
  useGenerateAudio,
  useGenerateImage,
  useGenerateSpeech,
  useGenerateVideo,
  useSummarize,
  useTranscription,
} from '@tanstack/ai-react'
import { EventType } from '@tanstack/ai'
import {
  
  GENERATION_EVENTS
  
} from '@tanstack/ai-client'
import type {ConnectConnectionAdapter, VideoGenerateResult} from '@tanstack/ai-client';
import type { ReactNode } from 'react'
import type {
  AudioGenerationResult,
  ImageGenerationResult,
  StreamChunk,
  SummarizationResult,
  TTSResult,
  TranscriptionResult,
} from '@tanstack/ai'
import type { LucideIcon } from 'lucide-react'

const SAMPLE_WAV_BASE64 = createToneWavBase64()
const SAMPLE_AUDIO_DATA_URL = `data:audio/wav;base64,${SAMPLE_WAV_BASE64}`
const SAMPLE_VIDEO_URL =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
const SAMPLE_TRANSCRIPTION_AUDIO = SAMPLE_AUDIO_DATA_URL

const imageConnection = createGenerationConnection<ImageGenerationResult>(
  'image',
  (data) => {
    const prompt = stringField(data, 'prompt', 'Generated devtools test image')
    const count = Math.max(
      1,
      Math.min(4, numberField(data, 'numberOfImages', 1)),
    )
    return {
      id: `local-image-${Date.now()}`,
      images: Array.from({ length: count }, (_, index) => ({
        url: svgDataUrl(
          `Image ${index + 1}`,
          prompt,
          index % 2 === 0 ? '#0ea5e9' : '#f97316',
        ),
        revisedPrompt: `${prompt} (${index + 1})`,
      })),
      model: 'local-devtools-image-fixture',
    }
  },
)

const audioConnection = createGenerationConnection<AudioGenerationResult>(
  'audio',
  (data) => ({
    id: `local-audio-${Date.now()}`,
    audio: {
      url: SAMPLE_AUDIO_DATA_URL,
      contentType: 'audio/wav',
      duration: numberField(data, 'duration', 3),
    },
    model: 'local-devtools-audio-fixture',
  }),
)

const speechConnection = createGenerationConnection<TTSResult>(
  'speech',
  () => ({
    id: `local-speech-${Date.now()}`,
    model: 'local-devtools-speech-fixture',
    audio: SAMPLE_WAV_BASE64,
    contentType: 'audio/wav',
    format: 'wav',
    duration: 0.8,
  }),
)

const transcriptionConnection = createGenerationConnection<TranscriptionResult>(
  'transcription',
  (data) => ({
    id: `local-transcription-${Date.now()}`,
    model: 'local-devtools-transcription-fixture',
    text: `Transcribed local fixture in ${stringField(data, 'language', 'en')}.`,
    language: stringField(data, 'language', 'en'),
    duration: 3,
    segments: [
      {
        id: 0,
        start: 0,
        end: 1.5,
        text: 'Transcribed local fixture',
      },
      {
        id: 1,
        start: 1.5,
        end: 3,
        text: 'ready for devtools inspection',
      },
    ],
  }),
)

const summarizeConnection = createGenerationConnection<SummarizationResult>(
  'summarize',
  (data) => {
    const text = stringField(data, 'text', SAMPLE_SUMMARY_TEXT)
    const style = stringField(data, 'style', 'concise')
    return {
      id: `local-summary-${Date.now()}`,
      summary: `${style}: ${text.split(/\s+/).slice(0, 24).join(' ')}.`,
      model: 'local-devtools-summary-fixture',
      usage: {
        promptTokens: text.split(/\s+/).length,
        completionTokens: 24,
        totalTokens: text.split(/\s+/).length + 24,
      },
    }
  },
)

const videoConnection = createVideoConnection()

const SAMPLE_SUMMARY_TEXT =
  'Generation hooks emit core devtools snapshots with input, progress, result, and renderable previews for media and text outputs.'

export const Route = createFileRoute('/generation-hooks')({
  component: GenerationHooksPage,
})

function GenerationHooksPage() {
  const [prompt, setPrompt] = useState(
    'A compact diagnostics console showing every TanStack AI generation hook',
  )
  const [speechText, setSpeechText] = useState(
    'This local fixture exercises the speech generation hook.',
  )
  const [summaryText, setSummaryText] = useState(SAMPLE_SUMMARY_TEXT)
  const [imageCount, setImageCount] = useState(2)
  const [audioDuration, setAudioDuration] = useState(3)

  const image = useGenerateImage({
    id: 'generation-hooks:useGenerateImage',
    connection: imageConnection,
  })

  const audio = useGenerateAudio({
    id: 'generation-hooks:useGenerateAudio',
    connection: audioConnection,
  })

  const speech = useGenerateSpeech({
    id: 'generation-hooks:useGenerateSpeech',
    connection: speechConnection,
  })

  const transcription = useTranscription({
    id: 'generation-hooks:useTranscription',
    connection: transcriptionConnection,
  })

  const summarize = useSummarize({
    id: 'generation-hooks:useSummarize',
    connection: summarizeConnection,
  })

  const video = useGenerateVideo({
    id: 'generation-hooks:useGenerateVideo',
    connection: videoConnection,
  })

  const loadingCount = [
    image.isLoading,
    audio.isLoading,
    speech.isLoading,
    transcription.isLoading,
    summarize.isLoading,
    video.isLoading,
  ].filter(Boolean).length

  const runImage = () => image.generate({ prompt, numberOfImages: imageCount })
  const runAudio = () => audio.generate({ prompt, duration: audioDuration })
  const runSpeech = () => speech.generate({ text: speechText, voice: 'local' })
  const runTranscription = () =>
    transcription.generate({
      audio: SAMPLE_TRANSCRIPTION_AUDIO,
      language: 'en',
    })
  const runSummarize = () =>
    summarize.generate({
      text: summaryText,
      style: 'bullet-points',
    })
  const runVideo = () => video.generate({ prompt })

  const runAll = async () => {
    await Promise.all([
      runImage(),
      runAudio(),
      runSpeech(),
      runTranscription(),
      runSummarize(),
      runVideo(),
    ])
  }

  const resetAll = () => {
    image.reset()
    audio.reset()
    speech.reset()
    transcription.reset()
    summarize.reset()
    video.reset()
  }

  const stopAll = () => {
    image.stop()
    audio.stop()
    speech.stop()
    transcription.stop()
    summarize.stop()
    video.stop()
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="flex flex-col gap-4 border-b border-gray-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
              Devtools fixture route
            </p>
            <h2 className="text-3xl font-semibold tracking-tight">
              Generation Hooks
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-gray-400">
              Six mounted hooks, stable IDs, local streaming fixtures, and
              media-shaped results for the devtools panel.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void runAll()}
              disabled={loadingCount > 0}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 disabled:bg-gray-800 disabled:text-gray-500"
            >
              <Play size={16} />
              Run All
            </button>
            <button
              type="button"
              onClick={stopAll}
              disabled={loadingCount === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/10 disabled:border-gray-800 disabled:text-gray-600"
            >
              Stop
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-gray-900"
            >
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Shared prompt
            </span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={3}
              className="min-h-24 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-cyan-500"
            />
          </label>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
            <Counter label="mounted" value={6} />
            <Counter label="running" value={loadingCount} />
            <Counter label="images" value={image.result?.images.length ?? 0} />
            <Counter
              label="complete"
              value={
                [
                  image.result,
                  audio.result,
                  speech.result,
                  transcription.result,
                  summarize.result,
                  video.result,
                ].filter(Boolean).length
              }
            />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <HookCard
            title="useGenerateImage"
            hookId="generation-hooks:useGenerateImage"
            icon={Image}
            status={image.status}
            isLoading={image.isLoading}
            error={image.error}
            onGenerate={() => void runImage()}
            onReset={image.reset}
          >
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setImageCount(count)}
                  className={`h-8 w-8 rounded-md text-xs font-semibold transition-colors ${
                    imageCount === count
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {image.result?.images.map((item, index) => (
                <img
                  key={`${item.url}-${index}`}
                  src={item.url ?? `data:image/png;base64,${item.b64Json}`}
                  alt={item.revisedPrompt ?? `Generated image ${index + 1}`}
                  className="aspect-video w-full rounded-md border border-gray-800 bg-gray-900 object-cover"
                />
              ))}
            </div>
          </HookCard>

          <HookCard
            title="useGenerateAudio"
            hookId="generation-hooks:useGenerateAudio"
            icon={Music}
            status={audio.status}
            isLoading={audio.isLoading}
            error={audio.error}
            onGenerate={() => void runAudio()}
            onReset={audio.reset}
          >
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Duration {audioDuration}s
              </span>
              <input
                type="range"
                min={1}
                max={10}
                value={audioDuration}
                onChange={(event) =>
                  setAudioDuration(Number(event.target.value))
                }
                className="accent-cyan-500"
              />
            </label>
            {audio.result?.audio.url && (
              <audio src={audio.result.audio.url} controls className="w-full" />
            )}
          </HookCard>

          <HookCard
            title="useGenerateSpeech"
            hookId="generation-hooks:useGenerateSpeech"
            icon={FileAudio}
            status={speech.status}
            isLoading={speech.isLoading}
            error={speech.error}
            onGenerate={() => void runSpeech()}
            onReset={speech.reset}
          >
            <textarea
              value={speechText}
              onChange={(event) => setSpeechText(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
            />
            {speech.result?.audio && (
              <audio
                src={`data:${speech.result.contentType ?? 'audio/wav'};base64,${
                  speech.result.audio
                }`}
                controls
                className="w-full"
              />
            )}
          </HookCard>

          <HookCard
            title="useTranscription"
            hookId="generation-hooks:useTranscription"
            icon={Mic}
            status={transcription.status}
            isLoading={transcription.isLoading}
            error={transcription.error}
            onGenerate={() => void runTranscription()}
            onReset={transcription.reset}
          >
            <p className="rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-sm leading-6 text-gray-200">
              {transcription.result?.text ?? 'No transcript yet.'}
            </p>
          </HookCard>

          <HookCard
            title="useSummarize"
            hookId="generation-hooks:useSummarize"
            icon={FileText}
            status={summarize.status}
            isLoading={summarize.isLoading}
            error={summarize.error}
            onGenerate={() => void runSummarize()}
            onReset={summarize.reset}
          >
            <textarea
              value={summaryText}
              onChange={(event) => setSummaryText(event.target.value)}
              rows={4}
              className="w-full rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
            />
            <p className="rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-sm leading-6 text-gray-200">
              {summarize.result?.summary ?? 'No summary yet.'}
            </p>
          </HookCard>

          <HookCard
            title="useGenerateVideo"
            hookId="generation-hooks:useGenerateVideo"
            icon={Video}
            status={video.status}
            isLoading={video.isLoading}
            error={video.error}
            onGenerate={() => void runVideo()}
            onReset={video.reset}
          >
            <div className="grid gap-2 text-xs text-gray-400 sm:grid-cols-3">
              <span>job {video.jobId ?? 'none'}</span>
              <span>status {video.videoStatus?.status ?? 'idle'}</span>
              <span>
                progress{' '}
                {video.videoStatus?.progress == null
                  ? '0%'
                  : `${video.videoStatus.progress}%`}
              </span>
            </div>
            {video.result?.url && (
              <video
                src={video.result.url}
                controls
                className="aspect-video w-full rounded-md border border-gray-800 bg-black"
              />
            )}
          </HookCard>
        </section>
      </div>
    </main>
  )
}

function HookCard({
  title,
  hookId,
  icon: Icon,
  status,
  isLoading,
  error,
  onGenerate,
  onReset,
  children,
}: {
  title: string
  hookId: string
  icon: LucideIcon
  status: string
  isLoading: boolean
  error?: Error
  onGenerate: () => void
  onReset: () => void
  children: ReactNode
}) {
  return (
    <article className="flex min-h-72 flex-col gap-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-300">
            <Icon size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-white">
              {title}
            </h3>
            <p className="truncate font-mono text-xs text-gray-500">{hookId}</p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-1 font-mono text-xs ${
            isLoading
              ? 'bg-cyan-500/15 text-cyan-200'
              : status === 'error'
                ? 'bg-red-500/15 text-red-200'
                : status === 'success'
                  ? 'bg-emerald-500/15 text-emerald-200'
                  : 'bg-gray-800 text-gray-300'
          }`}
        >
          {status}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-500 disabled:bg-gray-800 disabled:text-gray-500"
        >
          <Play size={14} />
          Run
        </button>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-md border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-800"
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error.message}
        </p>
      )}

      <div className="flex flex-1 flex-col gap-3">{children}</div>
    </article>
  )
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-gray-950 px-3 py-2">
      <div className="font-mono text-2xl font-semibold text-white">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
    </div>
  )
}

function createGenerationConnection<TResult>(
  label: string,
  createResult: (data: Record<string, unknown>) => TResult,
): ConnectConnectionAdapter {
  return {
    async *connect(_messages, data, abortSignal, runContext) {
      const runId = runContext?.runId ?? `${label}-run-${Date.now()}`
      const threadId = runContext?.threadId ?? `${label}-thread`
      yield runStarted(runId, threadId)
      await waitForFixtureStep(abortSignal)
      if (abortSignal?.aborted) return

      yield progress(25, `${label} queued`)
      await waitForFixtureStep(abortSignal)
      if (abortSignal?.aborted) return

      yield progress(70, `${label} rendering`)
      await waitForFixtureStep(abortSignal)
      if (abortSignal?.aborted) return

      yield result(createResult(toRecord(data)))
      await waitForFixtureStep(abortSignal)
      if (abortSignal?.aborted) return

      yield runFinished(runId, threadId)
    },
  }
}

function createVideoConnection(): ConnectConnectionAdapter {
  return {
    async *connect(_messages, data, abortSignal, runContext) {
      const runId = runContext?.runId ?? `video-run-${Date.now()}`
      const threadId = runContext?.threadId ?? 'video-thread'
      const jobId = `local-video-${Date.now()}`
      const prompt = stringField(
        toRecord(data),
        'prompt',
        'Local video fixture',
      )

      yield runStarted(runId, threadId)
      await waitForFixtureStep(abortSignal)
      if (abortSignal?.aborted) return

      yield custom(GENERATION_EVENTS.VIDEO_JOB_CREATED, { jobId })
      yield custom(GENERATION_EVENTS.VIDEO_STATUS, {
        jobId,
        status: 'pending',
        progress: 10,
      })
      await waitForFixtureStep(abortSignal)
      if (abortSignal?.aborted) return

      yield custom(GENERATION_EVENTS.VIDEO_STATUS, {
        jobId,
        status: 'processing',
        progress: 60,
      })
      await waitForFixtureStep(abortSignal)
      if (abortSignal?.aborted) return

      const finalResult: VideoGenerateResult = {
        jobId,
        status: 'completed',
        url: SAMPLE_VIDEO_URL,
      }
      yield custom(GENERATION_EVENTS.VIDEO_STATUS, {
        jobId,
        status: 'completed',
        progress: 100,
        url: SAMPLE_VIDEO_URL,
        prompt,
      })
      yield result(finalResult)
      yield runFinished(runId, threadId)
    },
  }
}

async function waitForFixtureStep(abortSignal: AbortSignal | undefined) {
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 180)
    abortSignal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout)
        resolve()
      },
      { once: true },
    )
  })
}

function runStarted(runId: string, threadId: string): StreamChunk {
  return {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: Date.now(),
  }
}

function runFinished(runId: string, threadId: string): StreamChunk {
  return {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    finishReason: 'stop',
    timestamp: Date.now(),
  }
}

function progress(value: number, message: string): StreamChunk {
  return custom(GENERATION_EVENTS.PROGRESS, {
    progress: value,
    message,
  })
}

function result(value: unknown): StreamChunk {
  return custom(GENERATION_EVENTS.RESULT, value)
}

function custom(name: string, value: unknown): StreamChunk {
  return {
    type: EventType.CUSTOM,
    name,
    value,
    timestamp: Date.now(),
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {}
}

function stringField(
  data: Record<string, unknown>,
  field: string,
  fallback: string,
): string {
  const value = data[field]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function numberField(
  data: Record<string, unknown>,
  field: string,
  fallback: number,
): number {
  const value = data[field]
  return typeof value === 'number' ? value : fallback
}

function createToneWavBase64({
  frequency = 440,
  durationSeconds = 0.8,
  sampleRate = 8000,
} = {}): string {
  const sampleCount = Math.floor(sampleRate * durationSeconds)
  const dataSize = sampleCount * 2
  const bytes = new Uint8Array(44 + dataSize)
  const view = new DataView(bytes.buffer)

  writeAscii(bytes, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(bytes, 8, 'WAVE')
  writeAscii(bytes, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(bytes, 36, 'data')
  view.setUint32(40, dataSize, true)

  for (let index = 0; index < sampleCount; index++) {
    const envelope = Math.sin((Math.PI * index) / sampleCount)
    const wave = Math.sin((2 * Math.PI * frequency * index) / sampleRate)
    const sample = Math.round(wave * envelope * 0.25 * 32767)
    view.setInt16(44 + index * 2, sample, true)
  }

  return bytesToBase64(bytes)
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index++) {
    bytes[offset + index] = value.charCodeAt(index)
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let output = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = index + 1 < bytes.length ? bytes[index + 1] : undefined
    const third = index + 2 < bytes.length ? bytes[index + 2] : undefined
    const combined = (first << 16) | ((second ?? 0) << 8) | (third ?? 0)

    output += alphabet[(combined >> 18) & 63]
    output += alphabet[(combined >> 12) & 63]
    output += second === undefined ? '=' : alphabet[(combined >> 6) & 63]
    output += third === undefined ? '=' : alphabet[combined & 63]
  }

  return output
}

function svgDataUrl(title: string, prompt: string, color: string): string {
  const safeTitle = escapeXml(title)
  const safePrompt = escapeXml(prompt)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#030712"/><rect x="36" y="36" width="888" height="468" rx="20" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="4"/><circle cx="810" cy="128" r="74" fill="${color}" fill-opacity="0.32"/><text x="72" y="130" fill="#f8fafc" font-family="monospace" font-size="48" font-weight="700">${safeTitle}</text><text x="72" y="210" fill="#cbd5e1" font-family="monospace" font-size="24">${safePrompt.slice(0, 56)}</text><text x="72" y="432" fill="${color}" font-family="monospace" font-size="20">local devtools fixture</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
