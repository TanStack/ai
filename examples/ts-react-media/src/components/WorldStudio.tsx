import { useRef, useState } from 'react'
import { Loader2, Square, TriangleAlert } from 'lucide-react'
import { generateWorldFn } from '@/lib/server-functions'
import { attachStream } from '@/lib/attach-stream'
import {
  byok,
  callWithByok,
  reactorByok,
  requestByokFromError,
} from '@/lib/byok'
import {
  WORLD_MODEL_LABELS,
  WORLD_MODELS,
  WORLD_PROMPTS,
  WORLD_RESOLUTIONS,
  isReactorWorldModel,
} from '@/lib/models'
import type { Reactor } from '@reactor-team/js-sdk'
import type { ReactorWorldModel, WorldResolution } from '@/lib/models'

type SessionStatus = 'idle' | 'connecting' | 'live' | 'error'

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

function readWorldPayload(value: unknown): {
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

export default function WorldStudio() {
  const [prompt, setPrompt] = useState<string>(WORLD_PROMPTS[0] ?? '')
  const [steerPrompt, setSteerPrompt] = useState('')
  const [model, setModel] = useState<ReactorWorldModel>('visko-orbis-stable')
  const [resolution, setResolution] = useState<WorldResolution>('1080p')
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const reactorRef = useRef<Reactor | null>(null)
  const detachStreamRef = useRef<(() => void) | null>(null)

  async function stop() {
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
    setPlaying(false)
    setStatus('idle')
  }

  async function start() {
    setError(null)
    setPlaying(false)
    setStatus('connecting')
    try {
      await byok.prepare(reactorByok.id)
      const world = readWorldPayload(
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

      reactor.on('error', (err) => {
        setError(err.message)
      })
      reactor.on('message', (msg) => {
        if (msg.type !== 'command_error') return
        if (typeof msg.data !== 'object' || msg.data === null) return
        if (!('reason' in msg.data)) return
        const reason = msg.data.reason
        if (typeof reason === 'string' && reason.length > 0) {
          setError(reason)
        }
      })
      reactor.on('trackReceived', (name, _track, stream) => {
        if (name !== 'main_video') return
        const video = videoRef.current
        if (!video) return
        detachStreamRef.current?.()
        detachStreamRef.current = attachStream(video, stream)
      })

      await reactor.connect(world.token)
      if (model === 'helios') {
        await reactor.sendCommand('set_sr_scale', {
          sr_scale: resolution === '2k' || resolution === '4k' ? '4x' : '2x',
        })
      } else {
        await reactor.sendCommand('set_resolution', {
          resolution,
        })
      }
      await reactor.sendCommand('set_prompt', { prompt: world.prompt })
      await reactor.sendCommand('start', {})
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
    const reactor = reactorRef.current
    const next = steerPrompt.trim()
    if (!reactor || next.length === 0) return
    setError(null)
    try {
      await reactor.sendCommand('set_prompt', { prompt: next })
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
        Live Reactor world. Paste a key in the header dialog, or set{' '}
        <code className="font-mono text-gray-300">REACTOR_API_KEY</code> on the
        server. Then start a session and type under the view to steer.
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
              ? 'Connecting to the world model…'
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
            rows={2}
            placeholder={
              isLive
                ? 'Steer the scene. The picture morphs at the next chunk.'
                : 'Describe the world to generate…'
            }
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none disabled:opacity-50"
          />
        </label>

        {isLive ? null : (
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
          {isLive ? (
            <>
              <button
                type="submit"
                disabled={steerPrompt.trim().length === 0}
                className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isBusy ? 'Starting…' : 'Start world'}
            </button>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-400">
            <span className="sr-only">Model</span>
            <select
              value={model}
              onChange={(event) => {
                const next = event.target.value
                if (isReactorWorldModel(next)) setModel(next)
              }}
              disabled={isLive || isBusy}
              className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-2 text-sm text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
            >
              {WORLD_MODELS.map((id) => (
                <option key={id} value={id}>
                  {WORLD_MODEL_LABELS[id]}
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
                if (isWorldResolution(next)) setResolution(next)
              }}
              disabled={isLive || isBusy}
              className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-2 text-sm text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
            >
              {WORLD_RESOLUTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
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
