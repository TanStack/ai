import { useEffect, useRef, useState } from 'react'
import { Loader2, Square, TriangleAlert } from 'lucide-react'
import { generateLiveVideoFn } from '@/lib/server-functions'
import { attachStream } from '@/lib/attach-stream'
import { SeedImageField } from '@/components/SeedImageField'
import {
  byok,
  callWithByok,
  falByok,
  reactorByok,
  requestByokFromError,
} from '@/lib/byok'
import {
  FAL_LIVE_VIDEO_APP,
  LIVE_VIDEO_MODEL_LABELS,
  LIVE_VIDEO_MODELS,
  LIVE_VIDEO_PROMPTS,
  isFalLiveVideoModel,
  isLiveVideoModelId,
  liveVideoProvider,
  liveVideoResolutions,
} from '@/lib/models'
import {
  liveAcceptsSeedImage,
  watchReactorFailure,
} from '@/lib/reactor-session'
import type { Reactor } from '@reactor-team/js-sdk'
import type {
  LiveVideoModelId,
  LiveVideoProvider,
  LiveVideoResolution,
} from '@/lib/models'

type SessionStatus = 'idle' | 'connecting' | 'live' | 'error'

type FalLiveSession = {
  send: (message: Record<string, unknown>) => void
  close: () => void | Promise<void>
}

type LiveHandle =
  | { provider: 'reactor'; reactor: Reactor; model: LiveVideoModelId }
  | { provider: 'fal'; session: FalLiveSession }

async function startReactorLive(
  reactor: Reactor,
  model: LiveVideoModelId,
  prompt: string,
  resolution: LiveVideoResolution,
  seedFile: File | null,
): Promise<void> {
  if (model === 'fast-h3') {
    await reactor.sendCommand('enqueue', { prompt })
    return
  }
  if (model === 'longlive-v2') {
    await reactor.sendCommand('set_shot', { prompt })
    await reactor.sendCommand('start', {})
    return
  }
  if (model === 'helios') {
    await reactor.sendCommand('set_sr_scale', {
      sr_scale: resolution === '2k' || resolution === '4k' ? '4x' : '2x',
    })
    if (seedFile) {
      const image = await reactor.uploadFile(seedFile)
      await reactor.sendCommand('set_conditioning', { prompt, image })
    } else {
      await reactor.sendCommand('set_prompt', { prompt })
    }
    await reactor.sendCommand('start', {})
    return
  }
  if (resolution === '1080p' || resolution === '2k' || resolution === '4k') {
    await reactor.sendCommand('set_resolution', { resolution })
  }
  await reactor.sendCommand('set_prompt', { prompt })
  await reactor.sendCommand('start', {})
}

async function steerReactorLive(
  reactor: Reactor,
  model: LiveVideoModelId,
  prompt: string,
): Promise<void> {
  if (model === 'fast-h3') {
    await reactor.sendCommand('enqueue', { prompt })
    return
  }
  if (model === 'longlive-v2') {
    await reactor.sendCommand('set_shot', { prompt })
    return
  }
  await reactor.sendCommand('set_prompt', { prompt })
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  if (cause instanceof Error && cause.message.length > 0) {
    return `${error.message} ${cause.message}`
  }
  return error.message
}

function readLivePayload(value: unknown): {
  token: string
  model: string
  prompt: string
  provider: LiveVideoProvider
} {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Live video payload is incomplete')
  }
  const token =
    'token' in value && typeof value.token === 'string' ? value.token : ''
  const model =
    'model' in value && typeof value.model === 'string' ? value.model : ''
  const prompt =
    'prompt' in value && typeof value.prompt === 'string' ? value.prompt : ''
  const provider =
    'provider' in value &&
    (value.provider === 'reactor' || value.provider === 'fal')
      ? value.provider
      : null
  if (
    token.length === 0 ||
    model.length === 0 ||
    prompt.length === 0 ||
    provider === null
  ) {
    throw new Error('Live video payload is incomplete')
  }
  return { token, model, prompt, provider }
}

function defaultResolution(provider: LiveVideoProvider): LiveVideoResolution {
  return provider === 'fal' ? '768p' : '1080p'
}

async function openFalSession(args: {
  model: string
  prompt: string
  resolution: LiveVideoResolution
  onMedia: (stream: MediaStream) => void
  onError: (error: unknown) => void
}): Promise<FalLiveSession> {
  const { createFalClient } = await import('@fal-ai/client')
  const { wma } = await import('@fal-ai/client/realtime')
  const fal = createFalClient({
    proxyUrl: '/api/fal/proxy',
    fetch: (input, init) => {
      const headers = new Headers(init?.headers)
      for (const [name, value] of Object.entries(byok.headers(falByok.id))) {
        headers.set(name, value)
      }
      return fetch(input, { ...init, headers })
    },
  })
  const wmaApp = isFalLiveVideoModel(args.model)
    ? FAL_LIVE_VIDEO_APP[args.model]
    : args.model
  const session = fal.realtime.open(wma(wmaApp), {
    receive: ['video', 'audio'],
    onMedia: args.onMedia,
    onError: args.onError,
    onData: (raw) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(String(raw))
      } catch {
        return
      }
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'type' in parsed &&
        parsed.type === 'error' &&
        'error' in parsed &&
        typeof parsed.error === 'string'
      ) {
        args.onError(new Error(parsed.error))
      }
    },
    onState: (state) => {
      if (state === 'failed') args.onError(new Error('Live session failed'))
    },
  })
  session.send({
    type: 'configure',
    prompt: args.prompt,
    prompt_version: 1,
    protocol_version: 1,
    ...(args.resolution === '480p' || args.resolution === '768p'
      ? { resolution: args.resolution }
      : {}),
  })
  await session.ready
  return session
}

export default function LiveVideoStudio() {
  const [prompt, setPrompt] = useState<string>(LIVE_VIDEO_PROMPTS[0] ?? '')
  const [steerPrompt, setSteerPrompt] = useState('')
  const [model, setModel] = useState<LiveVideoModelId>('helios')
  const [resolution, setResolution] = useState<LiveVideoResolution>('1080p')
  const [seedFile, setSeedFile] = useState<File | null>(null)
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const handleRef = useRef<LiveHandle | null>(null)
  const detachStreamRef = useRef<(() => void) | null>(null)
  const unwatchRef = useRef<(() => void) | null>(null)
  const falPromptVersionRef = useRef(1)
  const statusRef = useRef<SessionStatus>('idle')
  statusRef.current = status

  const provider = liveVideoProvider(model)
  const resolutions = liveVideoResolutions(provider)
  const keyProvider = provider === 'fal' ? falByok : reactorByok
  const showSeedField = liveAcceptsSeedImage(model)

  async function teardown() {
    unwatchRef.current?.()
    unwatchRef.current = null
    const handle = handleRef.current
    handleRef.current = null
    detachStreamRef.current?.()
    detachStreamRef.current = null
    if (handle?.provider === 'reactor') {
      try {
        await handle.reactor.disconnect()
      } catch {
        // Disconnect can fail if the session already ended.
      }
    } else if (handle?.provider === 'fal') {
      try {
        handle.session.send({ type: 'stop' })
        await handle.session.close()
      } catch {
        // Close can fail if the session already ended.
      }
    }
    const video = videoRef.current
    if (video) {
      video.srcObject = null
    }
  }

  async function stop() {
    await teardown()
    setPlaying(false)
    setStatus('idle')
  }

  useEffect(() => {
    return () => {
      void teardown()
    }
  }, [])

  async function start() {
    setError(null)
    setPlaying(false)
    setStatus('connecting')
    try {
      await byok.prepare(keyProvider.id)
      const live = readLivePayload(
        await callWithByok(
          generateLiveVideoFn({
            data: { prompt, model, resolution },
            headers: byok.headers(keyProvider.id),
          }),
        ),
      )
      const video = videoRef.current
      if (!video) throw new Error('Video element is missing')

      if (live.provider === 'fal') {
        falPromptVersionRef.current = 1
        const session = await openFalSession({
          model: live.model,
          prompt: live.prompt,
          resolution,
          onMedia: (stream) => {
            detachStreamRef.current?.()
            detachStreamRef.current = attachStream(
              video,
              stream,
              (playError) => {
                setError(errorMessage(playError))
              },
            )
          },
          onError: (openError) => {
            setError(errorMessage(openError))
            setStatus('error')
          },
        })
        handleRef.current = { provider: 'fal', session }
      } else {
        const { Reactor: ReactorClient } = await import('@reactor-team/js-sdk')
        const reactor = new ReactorClient({
          modelName: live.model,
        })
        handleRef.current = { provider: 'reactor', reactor, model }

        let rejectStart: ((error: Error) => void) | undefined
        const startFailed = new Promise<never>((_, reject) => {
          rejectStart = reject
        })
        unwatchRef.current = watchReactorFailure(reactor, (message) => {
          setError(message)
          rejectStart?.(new Error(message))
          if (statusRef.current === 'live') setStatus('error')
        })
        reactor.on('trackReceived', (name, _track, stream) => {
          if (name !== 'main_video') return
          detachStreamRef.current?.()
          detachStreamRef.current = attachStream(video, stream, (playError) => {
            setError(errorMessage(playError))
          })
        })

        await reactor.connect(live.token)
        try {
          await Promise.race([
            startReactorLive(reactor, model, live.prompt, resolution, seedFile),
            startFailed,
          ])
        } finally {
          rejectStart = undefined
        }
      }

      setSteerPrompt('')
      setStatus('live')
    } catch (caught) {
      await stop()
      requestByokFromError(caught)
      setError(errorMessage(caught))
      setStatus('error')
    }
  }

  async function steer() {
    const handle = handleRef.current
    const next = steerPrompt.trim()
    if (!handle || next.length === 0) return
    setError(null)
    try {
      if (handle.provider === 'fal') {
        falPromptVersionRef.current += 1
        handle.session.send({
          type: 'prompt',
          prompt: next,
          prompt_version: falPromptVersionRef.current,
        })
      } else {
        await steerReactorLive(handle.reactor, handle.model, next)
      }
      setPrompt(next)
      setSteerPrompt('')
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const isLive = status === 'live'
  const isBusy = status === 'connecting'

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">
        Live video. Paste a key in the header dialog, or set{' '}
        <code className="font-mono text-gray-300">
          {provider === 'fal' ? 'FAL_KEY' : 'REACTOR_API_KEY'}
        </code>{' '}
        on the server. Then start a session and type under the view to steer.
      </p>

      <div className="overflow-hidden rounded-xl border border-gray-700 bg-black">
        <video
          ref={videoRef}
          className="aspect-video w-full bg-black"
          autoPlay
          playsInline
          muted
          onPlaying={() => setPlaying(true)}
        />
        {status === 'idle' || status === 'error' ? (
          <p className="px-4 py-3 text-sm text-gray-400">
            The live stream appears here after you start a session.
          </p>
        ) : null}
        {status === 'connecting' || (status === 'live' && !playing) ? (
          <p className="px-4 py-3 text-sm text-gray-400">
            {status === 'connecting'
              ? 'Connecting to the video model…'
              : 'Waiting for the first frame…'}
          </p>
        ) : null}
      </div>

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (isLive) {
            void steer()
            return
          }
          if (!isBusy && prompt.trim().length > 0) void start()
        }}
      >
        <label className="block">
          <span className="sr-only">{isLive ? 'Steer prompt' : 'Prompt'}</span>
          <textarea
            value={isLive ? steerPrompt : prompt}
            onChange={(event) => {
              const next = event.target.value
              if (isLive) setSteerPrompt(next)
              else setPrompt(next)
            }}
            disabled={isBusy}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }}
            rows={2}
            placeholder={
              isLive
                ? 'Steer the scene. The picture morphs at the next chunk.'
                : 'Describe the video to generate…'
            }
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none disabled:opacity-50"
          />
        </label>

        {isLive ? null : (
          <div className="flex flex-wrap gap-1.5">
            {LIVE_VIDEO_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                title={example}
                onClick={() => setPrompt(example)}
                disabled={isBusy}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  prompt === example
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {example.length > 36 ? `${example.slice(0, 36)}…` : example}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {isLive ? (
            <>
              <button
                type="submit"
                disabled={steerPrompt.trim().length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
              <button
                type="button"
                onClick={() => void stop()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-500"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
            </>
          ) : (
            <button
              type="submit"
              disabled={isBusy || prompt.trim().length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isBusy ? 'Starting…' : 'Start live'}
            </button>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-400">
            <span className="sr-only">Model</span>
            <select
              value={model}
              onChange={(event) => {
                const next = event.target.value
                if (!isLiveVideoModelId(next)) return
                setModel(next)
                const nextProvider = liveVideoProvider(next)
                const nextResolutions = liveVideoResolutions(nextProvider)
                if (
                  !nextResolutions.includes(
                    resolution as (typeof nextResolutions)[number],
                  )
                ) {
                  setResolution(defaultResolution(nextProvider))
                }
              }}
              disabled={isLive || isBusy}
              className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
            >
              {LIVE_VIDEO_MODELS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {LIVE_VIDEO_MODEL_LABELS[entry.id]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-400">
            <span className="sr-only">Resolution</span>
            <select
              value={resolution}
              onChange={(event) => {
                const next = event.target.value
                if (
                  resolutions.includes(next as (typeof resolutions)[number])
                ) {
                  setResolution(next as LiveVideoResolution)
                }
              }}
              disabled={isLive || isBusy}
              className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
            >
              {resolutions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          {isLive || !showSeedField ? null : (
            <SeedImageField
              file={seedFile}
              onChange={setSeedFile}
              required={false}
              disabled={isBusy}
            />
          )}
        </div>
      </form>

      {error ? (
        <p className="flex items-start gap-2 text-sm text-red-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  )
}
