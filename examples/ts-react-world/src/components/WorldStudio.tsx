import { useRef, useState } from 'react'
import { Loader2, Square, TriangleAlert } from 'lucide-react'
import { ByokBlockedError, isByokMissingBody } from '@tanstack/ai/byok'
import {
  EXAMPLE_PROMPTS,
  RESOLUTIONS,
  WORLD_MODEL_LABELS,
  WORLD_MODELS,
  isReactorWorldModel,
} from '@/lib/models'
import { byok, reactorByok } from '@/lib/byok'
import ReactorKey from '@/components/ReactorKey'
import type { Reactor } from '@reactor-team/js-sdk'
import type { ReactorWorldModel, WorldResolution } from '@/lib/models'

type SessionStatus = 'idle' | 'connecting' | 'live' | 'error'

function isWorldResolution(value: string): value is WorldResolution {
  return (RESOLUTIONS as ReadonlyArray<string>).includes(value)
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
  resolution: string
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
  const resolution =
    'resolution' in value && typeof value.resolution === 'string'
      ? value.resolution
      : ''
  if (
    token.length === 0 ||
    model.length === 0 ||
    prompt.length === 0 ||
    resolution.length === 0
  ) {
    throw new Error('World payload is incomplete')
  }
  return { token, model, prompt, resolution }
}

async function mintWorld(input: {
  prompt: string
  model: string
  resolution: string
}) {
  try {
    await byok.prepare(reactorByok.id)
  } catch (error) {
    if (error instanceof ByokBlockedError && error.reason === 'locked') {
      throw new Error('Unlock the saved Reactor key, then start again.')
    }
    throw error
  }
  const response = await fetch('/api/world', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...byok.headers(reactorByok.id),
    },
    body: JSON.stringify(input),
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (isByokMissingBody(body)) {
      throw new Error(
        'Missing Reactor API key. Paste a key, or set REACTOR_API_KEY on the server.',
      )
    }
    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : `World session failed (${response.status})`
    throw new Error(message)
  }
  return readWorldPayload(body)
}

export default function WorldStudio() {
  const [prompt, setPrompt] = useState<string>(EXAMPLE_PROMPTS[0] ?? '')
  const [steerPrompt, setSteerPrompt] = useState('')
  const [model, setModel] = useState<ReactorWorldModel>('visko-orbis-stable')
  const [resolution, setResolution] = useState<WorldResolution>('1080p')
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const reactorRef = useRef<Reactor | null>(null)

  async function stop() {
    const reactor = reactorRef.current
    reactorRef.current = null
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
    setStatus('idle')
  }

  async function start() {
    setError(null)
    setStatus('connecting')
    try {
      const world = await mintWorld({ prompt, model, resolution })

      const { Reactor: ReactorClient } = await import('@reactor-team/js-sdk')
      const reactor = new ReactorClient({
        modelName: world.model,
      })
      reactorRef.current = reactor

      reactor.on('trackReceived', (name, _track, stream) => {
        if (name !== 'main_video') return
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        void video.play()
      })

      await reactor.connect(world.token)
      await reactor.sendCommand('set_resolution', {
        resolution,
      })
      await reactor.sendCommand('set_prompt', { prompt: world.prompt })
      await reactor.sendCommand('start', {})
      setSteerPrompt('')
      setStatus('live')
    } catch (caught) {
      await stop()
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
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-gray-700 bg-black">
        <video
          ref={videoRef}
          className="aspect-video w-full bg-black"
          autoPlay
          playsInline
          muted={false}
        />
        {status !== 'live' ? (
          <p className="px-4 py-3 text-sm text-gray-400">
            {status === 'connecting'
              ? 'Connecting to the world model…'
              : 'The live stream appears here after you start a session.'}
          </p>
        ) : null}
      </div>

      <div className="space-y-4 rounded-xl border border-gray-700 bg-gray-800/50 p-6">
        <ReactorKey />

        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              disabled={isLive || isBusy}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                prompt === example
                  ? 'border-purple-500 bg-purple-600 text-white'
                  : 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-700'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {example.length > 48 ? `${example.slice(0, 48)}…` : example}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-300">Prompt</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={isLive || isBusy}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none disabled:opacity-50"
          />
        </label>

        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-300">Model</span>
            <select
              value={model}
              onChange={(event) => {
                const next = event.target.value
                if (isReactorWorldModel(next)) setModel(next)
              }}
              disabled={isLive || isBusy}
              className="mt-1 block rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
            >
              {WORLD_MODELS.map((id) => (
                <option key={id} value={id}>
                  {WORLD_MODEL_LABELS[id]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-300">
              Resolution
            </span>
            <select
              value={resolution}
              onChange={(event) => {
                const next = event.target.value
                if (isWorldResolution(next)) setResolution(next)
              }}
              disabled={isLive || isBusy}
              className="mt-1 block rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
            >
              {RESOLUTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          {isLive ? (
            <button
              type="button"
              onClick={() => void stop()}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-500"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              disabled={isBusy || prompt.trim().length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isBusy ? 'Starting…' : 'Start world'}
            </button>
          )}
        </div>

        {isLive ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void steer()
            }}
          >
            <label className="block">
              <span className="text-sm font-medium text-gray-300">
                Steer mid-run
              </span>
              <textarea
                value={steerPrompt}
                onChange={(event) => setSteerPrompt(event.target.value)}
                rows={2}
                placeholder="Describe the next beat. The picture morphs at the next chunk."
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={steerPrompt.trim().length === 0}
              className="self-start rounded-lg bg-gray-700 px-4 py-2 font-medium text-white hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send prompt
            </button>
          </form>
        ) : null}

        {error ? (
          <p className="flex items-start gap-2 text-sm text-red-400">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
