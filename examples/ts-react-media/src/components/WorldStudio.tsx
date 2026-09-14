import { useEffect, useRef, useState } from 'react'
import { Loader2, Square, TriangleAlert } from 'lucide-react'
import { generateWorldFn } from '@/lib/server-functions'
import { attachStream } from '@/lib/attach-stream'
import { readMediaFile } from '@/lib/media'
import { LingbotControls } from '@/components/LingbotControls'
import { SeedImageField } from '@/components/SeedImageField'
import {
  byok,
  callWithByok,
  reactorByok,
  requestByokFromError,
  worldlabsByok,
} from '@/lib/byok'
import {
  WORLD_MODEL_LABELS,
  WORLD_MODELS,
  WORLD_PROMPTS,
  WORLD_RESOLUTIONS,
  isReactorWorldModel,
  isWorldLabsWorldModel,
  isWorldModelId,
} from '@/lib/models'
import {
  LINGBOT_ROTATION_SPEED_DEG,
  lingbotPrompt,
  setReactorImage,
  watchReactorFailure,
  worldNeedsSeedImage,
} from '@/lib/reactor-session'
import type { Reactor } from '@reactor-team/js-sdk'
import type {
  ReactorWorldModel,
  WorldModelId,
  WorldResolution,
} from '@/lib/models'

type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'generating'
  | 'ready'
  | 'error'

type MarbleResult = {
  url: string
  thumbnailUrl?: string
  caption?: string
}

function isWorldResolution(value: string): value is WorldResolution {
  return (WORLD_RESOLUTIONS as ReadonlyArray<string>).includes(value)
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  if (cause instanceof Error && cause.message.length > 0) {
    return `${error.message} ${cause.message}`
  }
  return error.message
}

function readReactorPayload(value: unknown): {
  token: string
  model: string
  prompt: string
} {
  if (typeof value !== 'object' || value === null) {
    throw new Error('World payload is incomplete')
  }
  const token =
    'token' in value && typeof value.token === 'string' ? value.token : ''
  const model =
    'model' in value && typeof value.model === 'string' ? value.model : ''
  const prompt =
    'prompt' in value && typeof value.prompt === 'string' ? value.prompt : ''
  if (token.length === 0 || model.length === 0 || prompt.length === 0) {
    throw new Error('World payload is incomplete')
  }
  return { token, model, prompt }
}

const WORLDLABS_MAX_SEED_IMAGES = 4

function imageExtension(file: File): string | undefined {
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'jpeg') return 'jpg'
  if (ext === 'jpg' || ext === 'png' || ext === 'webp') return ext
  return undefined
}

function readMarblePayload(value: unknown): MarbleResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('World payload is incomplete')
  }
  const url = 'url' in value && typeof value.url === 'string' ? value.url : ''
  if (url.length === 0) {
    throw new Error('World payload is incomplete')
  }
  const thumbnailUrl =
    'thumbnailUrl' in value && typeof value.thumbnailUrl === 'string'
      ? value.thumbnailUrl
      : undefined
  const caption =
    'caption' in value && typeof value.caption === 'string'
      ? value.caption
      : undefined
  return { url, thumbnailUrl, caption }
}

async function startReactorWorld(
  reactor: Reactor,
  model: ReactorWorldModel,
  prompt: string,
  resolution: WorldResolution,
  seedFile: File | null,
): Promise<void> {
  if (model === 'helios') {
    await reactor.sendCommand('set_sr_scale', {
      sr_scale: resolution === '2k' || resolution === '4k' ? '4x' : '2x',
    })
  } else if (!worldNeedsSeedImage(model)) {
    await reactor.sendCommand('set_resolution', { resolution })
  }
  if (worldNeedsSeedImage(model)) {
    if (!seedFile) throw new Error('LingBot needs a seed image before start')
    await setReactorImage(reactor, seedFile)
    await reactor.sendCommand('set_rotation_speed_deg', {
      rotation_speed_deg: LINGBOT_ROTATION_SPEED_DEG,
    })
    await reactor.sendCommand('set_prompt', { prompt: lingbotPrompt(prompt) })
    await reactor.sendCommand('start', {})
    return
  }
  if (seedFile && model === 'helios') {
    const image = await reactor.uploadFile(seedFile)
    await reactor.sendCommand('set_conditioning', { prompt, image })
    await reactor.sendCommand('start', {})
    return
  }
  // Orbis: the image is optional and only read before start.
  if (seedFile) await setReactorImage(reactor, seedFile)
  await reactor.sendCommand('set_prompt', { prompt })
  await reactor.sendCommand('start', {})
}

export default function WorldStudio() {
  const [prompt, setPrompt] = useState<string>(WORLD_PROMPTS[0] ?? '')
  const [steerPrompt, setSteerPrompt] = useState('')
  const [model, setModel] = useState<WorldModelId>('visko-orbis-stable')
  const [resolution, setResolution] = useState<WorldResolution>('1080p')
  const [seedFiles, setSeedFiles] = useState<Array<File>>([])
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [marble, setMarble] = useState<MarbleResult | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const reactorRef = useRef<Reactor | null>(null)
  const detachStreamRef = useRef<(() => void) | null>(null)
  const unwatchRef = useRef<(() => void) | null>(null)
  const statusRef = useRef<SessionStatus>('idle')
  statusRef.current = status

  const isMarble = isWorldLabsWorldModel(model)
  const seedFile = seedFiles[0] ?? null
  const needsSeed = isReactorWorldModel(model) && worldNeedsSeedImage(model)

  async function teardown() {
    unwatchRef.current?.()
    unwatchRef.current = null
    const reactor = reactorRef.current
    reactorRef.current = null
    detachStreamRef.current?.()
    detachStreamRef.current = null
    if (reactor) {
      try {
        await reactor.disconnect()
      } catch {
        // Disconnect can fail if the session already ended.
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
    setMarble(null)
    setStatus('idle')
  }

  useEffect(() => {
    return () => {
      void teardown()
    }
  }, [])

  async function startMarble() {
    setError(null)
    setMarble(null)
    setStatus('generating')
    try {
      await byok.prepare(worldlabsByok.id)
      const seedImages = await Promise.all(
        seedFiles.slice(0, WORLDLABS_MAX_SEED_IMAGES).map(async (file) => {
          const media = await readMediaFile(file)
          const extension = imageExtension(file)
          return {
            dataBase64: media.base64,
            ...(extension ? { extension } : {}),
          }
        }),
      )
      const world = readMarblePayload(
        await callWithByok(
          generateWorldFn({
            data: {
              prompt,
              model,
              resolution,
              ...(seedImages.length > 0 ? { seedImages } : {}),
            },
            headers: byok.headers(worldlabsByok.id),
          }),
        ),
      )
      setMarble(world)
      setStatus('ready')
    } catch (caught) {
      setMarble(null)
      requestByokFromError(caught)
      setError(errorMessage(caught))
      setStatus('error')
    }
  }

  async function startReactor() {
    if (!isReactorWorldModel(model)) {
      throw new Error(`Unknown world model: ${model}`)
    }
    setError(null)
    setPlaying(false)
    setMarble(null)
    setStatus('connecting')
    try {
      if (needsSeed && !seedFile) {
        throw new Error('LingBot needs a seed image before start')
      }
      await byok.prepare(reactorByok.id)
      const world = readReactorPayload(
        await callWithByok(
          generateWorldFn({
            data: { prompt, model, resolution },
            headers: byok.headers(reactorByok.id),
          }),
        ),
      )

      const { Reactor: ReactorClient } = await import('@reactor-team/js-sdk')
      const reactor = new ReactorClient({
        modelName: world.model,
      })
      reactorRef.current = reactor

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
        const video = videoRef.current
        if (!video) {
          setError('Video element is missing')
          setStatus('error')
          return
        }
        detachStreamRef.current?.()
        detachStreamRef.current = attachStream(video, stream, (playError) => {
          setError(errorMessage(playError))
        })
      })

      await reactor.connect(world.token)
      try {
        await Promise.race([
          startReactorWorld(reactor, model, world.prompt, resolution, seedFile),
          startFailed,
        ])
      } finally {
        rejectStart = undefined
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

  async function start() {
    if (isMarble) {
      await startMarble()
      return
    }
    await startReactor()
  }

  async function steer() {
    const reactor = reactorRef.current
    const next = steerPrompt.trim()
    if (!reactor || next.length === 0) return
    setError(null)
    try {
      if (needsSeed) {
        // LingBot follows the image over the text. Keep the scene base and
        // add the steer as a detail so the prompt still matches the image.
        await reactor.sendCommand('set_prompt', {
          prompt: lingbotPrompt(prompt, next),
        })
      } else {
        await reactor.sendCommand('set_prompt', { prompt: next })
        setPrompt(next)
      }
      setSteerPrompt('')
      // Hand the keyboard back to the LingBot pads.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const isLive = status === 'live'
  const isBusy = status === 'connecting' || status === 'generating'
  const canStart =
    !isBusy && prompt.trim().length > 0 && (!needsSeed || seedFile !== null)

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">
        {isMarble ? (
          <>
            World Labs Marble generates a finished 3D world (about 5 minutes).
            Paste a key in the header dialog, or set{' '}
            <code className="font-mono text-gray-300">WORLDLABS_API_KEY</code>{' '}
            on the server. Add optional seed photos (up to four of the same
            scene), then open the Marble viewer URL.
          </>
        ) : (
          <>
            Live Reactor world. Paste a key in the header dialog, or set{' '}
            <code className="font-mono text-gray-300">REACTOR_API_KEY</code> on
            the server.
            {needsSeed
              ? ' Attach a seed image, describe what it shows, then start. The world opens full screen. Move with the pads, WASD, or the arrow keys.'
              : ' Add an optional 16:9 seed image and start. The world opens full screen. Type in the bar at the bottom to steer.'}
          </>
        )}
      </p>

      {isMarble ? (
        <div className="overflow-hidden rounded-xl border border-gray-700 bg-black">
          {marble?.thumbnailUrl ? (
            <img
              src={marble.thumbnailUrl}
              alt={marble.caption ?? 'Generated world'}
              className="aspect-video w-full object-cover"
            />
          ) : null}
          {status === 'generating' ? (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating the world. This usually takes a few minutes.
            </p>
          ) : marble ? (
            <div className="space-y-2 px-4 py-3">
              {marble.caption ? (
                <p className="text-sm text-gray-300">{marble.caption}</p>
              ) : null}
              <a
                href={marble.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-sm font-medium text-purple-300 hover:text-purple-200"
              >
                Open in Marble
              </a>
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-gray-400">
              The Marble viewer link appears here after generation finishes.
            </p>
          )}
        </div>
      ) : (
        <div
          className={
            isLive
              ? 'fixed inset-0 z-50 bg-black'
              : 'overflow-hidden rounded-xl border border-gray-700 bg-black'
          }
        >
          <video
            ref={videoRef}
            className={
              isLive
                ? 'h-full w-full object-cover'
                : 'aspect-video w-full bg-black'
            }
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
          {status === 'connecting' ? (
            <p className="px-4 py-3 text-sm text-gray-400">
              Connecting to the world model…
            </p>
          ) : null}
          {isLive && !playing ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-300">
              Waiting for the first frame…
            </p>
          ) : null}
          {isLive &&
          needsSeed &&
          isReactorWorldModel(model) &&
          reactorRef.current ? (
            // Pads sit above the input bar.
            <div className="absolute inset-x-0 top-0 bottom-24">
              <LingbotControls
                reactor={reactorRef.current}
                model={model}
                onError={setError}
              />
            </div>
          ) : null}
          {isLive ? (
            <form
              className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 to-transparent px-4 pt-10 pb-4"
              onSubmit={(event) => {
                event.preventDefault()
                void steer()
              }}
            >
              {error ? (
                <p className="flex items-start gap-2 text-sm text-red-300">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              ) : null}
              <div className="mx-auto flex max-w-3xl items-end gap-2">
                <label className="flex-1">
                  <span className="sr-only">Steer prompt</span>
                  <textarea
                    value={steerPrompt}
                    onChange={(event) => setSteerPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' || event.shiftKey) return
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }}
                    rows={1}
                    placeholder={
                      needsSeed
                        ? 'Add a detail, e.g. It is night and the street lamps glow.'
                        : 'Steer the scene. The picture morphs at the next chunk.'
                    }
                    className="block w-full resize-none rounded-xl border border-white/20 bg-black/40 px-4 py-3 text-white placeholder-gray-300 backdrop-blur-md focus:border-purple-400 focus:outline-none"
                  />
                </label>
                <button
                  type="submit"
                  disabled={steerPrompt.trim().length === 0}
                  className="rounded-xl bg-purple-600/90 px-4 py-3 font-medium text-white backdrop-blur-md hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={() => void stop()}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600/90 px-4 py-3 font-medium text-white backdrop-blur-md hover:bg-red-500"
                >
                  <Square className="h-4 w-4" />
                  Stop
                </button>
              </div>
            </form>
          ) : null}
        </div>
      )}

      {isLive ? null : (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (canStart) void start()
          }}
        >
          <label className="block">
            <span className="sr-only">Prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={isBusy}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }}
              rows={2}
              placeholder={
                needsSeed
                  ? 'Describe what the seed image shows…'
                  : 'Describe the world to generate…'
              }
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none disabled:opacity-50"
            />
          </label>

          {needsSeed ? null : (
            <div className="flex flex-wrap gap-1.5">
              {WORLD_PROMPTS.map((example) => (
                <button
                  key={example}
                  type="button"
                  title={example}
                  onClick={() => setPrompt(example)}
                  disabled={isBusy}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    prompt === example
                      ? 'border-purple-500 bg-purple-600 text-white'
                      : 'border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {example.length > 36 ? `${example.slice(0, 36)}…` : example}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!canStart}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isBusy
                ? isMarble
                  ? 'Generating…'
                  : 'Starting…'
                : isMarble
                  ? 'Generate world'
                  : 'Start world'}
            </button>

            <label className="flex items-center gap-2 text-sm text-gray-400">
              <span className="sr-only">Model</span>
              <select
                value={model}
                onChange={(event) => {
                  const next = event.target.value
                  if (!isWorldModelId(next)) return
                  if (isLive || status === 'ready') void stop()
                  if (!isWorldLabsWorldModel(next) && seedFiles.length > 1) {
                    setSeedFiles(seedFiles.slice(0, 1))
                  }
                  setModel(next)
                }}
                disabled={isBusy}
                className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-2 text-sm text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
              >
                {WORLD_MODELS.map((id) => (
                  <option key={id} value={id}>
                    {WORLD_MODEL_LABELS[id]}
                  </option>
                ))}
              </select>
            </label>

            {needsSeed || isMarble ? null : (
              <label className="flex items-center gap-2 text-sm text-gray-400">
                <span className="sr-only">Resolution</span>
                <select
                  value={resolution}
                  onChange={(event) => {
                    const next = event.target.value
                    if (isWorldResolution(next)) setResolution(next)
                  }}
                  disabled={isBusy}
                  className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-2 text-sm text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
                >
                  {WORLD_RESOLUTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <SeedImageField
              files={seedFiles}
              onChange={setSeedFiles}
              maxFiles={isMarble ? WORLDLABS_MAX_SEED_IMAGES : 1}
              required={needsSeed}
              disabled={isBusy}
            />
          </div>
        </form>
      )}

      {error && !isLive ? (
        <p className="flex items-start gap-2 text-sm text-red-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  )
}
