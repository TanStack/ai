import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { MusicGenerationResult } from '@tanstack/ai'
import { generateMusicFn } from '../lib/server-fns'
import {
  AudioGenerationForm,
  type AudioGenerationMode,
} from '../lib/audio-generation-form'
import { MUSIC_PROVIDERS, type MusicProviderId } from '../lib/audio-providers'

async function generateViaRoute(input: {
  prompt: string
  duration?: number
  provider: MusicProviderId
  model?: string
}): Promise<MusicGenerationResult> {
  const response = await fetch('/api/generate/music', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: input }),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || 'Music generation failed')
  }
  return payload.result as MusicGenerationResult
}

function generateViaServerFn(input: {
  prompt: string
  duration?: number
  provider: MusicProviderId
  model?: string
}): Promise<MusicGenerationResult> {
  return generateMusicFn({ data: input })
}

function MusicGenerationPage() {
  const [mode, setMode] = useState<AudioGenerationMode>('direct')
  const [provider, setProvider] = useState<MusicProviderId>('gemini-lyria')

  const config = MUSIC_PROVIDERS.find((p) => p.id === provider)!

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Music Generation</h2>
            <p className="text-sm text-gray-400 mt-1">
              Generate music from text prompts.
            </p>
          </div>
          <div className="flex gap-1 bg-gray-900/50 rounded-lg p-1">
            {(['direct', 'server-fn'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === m
                    ? 'bg-orange-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {m === 'server-fn' ? 'Server Fn' : 'Direct'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-b border-orange-500/20 bg-gray-800/60 px-6 py-3">
        <div className="flex flex-wrap gap-2">
          {MUSIC_PROVIDERS.map((p) => (
            <button
              key={p.id}
              data-testid={`provider-tab-${p.id}`}
              onClick={() => setProvider(p.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                provider === p.id
                  ? 'bg-orange-500/80 text-white'
                  : 'bg-gray-900 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <AudioGenerationForm<MusicProviderId>
            key={`${mode}-${config.id}`}
            mode={mode}
            config={config}
            generateViaServerFn={generateViaServerFn}
            generateViaRoute={generateViaRoute}
            kind="music"
          />
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/generations/music')({
  component: MusicGenerationPage,
})
