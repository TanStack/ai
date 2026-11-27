import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { realtimeSession, realtimeToken } from '@tanstack/ai'
import { useRealtimeChat } from '@tanstack/ai-react'
import {
  openaiLive,
  openaiLiveSession,
  openaiRealtime,
  openaiRealtimeToken,
} from '@tanstack/ai-openai'
import {
  elevenlabsRealtime,
  elevenlabsRealtimeToken,
} from '@tanstack/ai-elevenlabs'
import { geminiRealtime, geminiRealtimeToken } from '@tanstack/ai-gemini'
import { grokRealtime, grokRealtimeToken } from '@tanstack/ai-grok'
import type { RealtimeSessionRequest } from '@tanstack/ai'
import { realtimeClientTools } from '@/lib/realtime-tools'

type TokenProvider = 'openai' | 'elevenlabs' | 'gemini' | 'grok'
export type Provider = TokenProvider | 'openai-live'

const getRealtimeTokenFn = createServerFn({ method: 'POST' })
  .validator((data: { provider: TokenProvider; language?: string }) => {
    if (!data.provider) throw new Error('Provider is required')
    return data
  })
  .handler(async ({ data }) => {
    if (data.provider === 'openai') {
      return realtimeToken({
        adapter: openaiRealtimeToken({
          model: 'gpt-realtime-2.1',
        }),
      })
    }

    if (data.provider === 'gemini') {
      return realtimeToken({
        adapter: geminiRealtimeToken(),
      })
    }

    if (data.provider === 'elevenlabs') {
      return realtimeToken({
        adapter: elevenlabsRealtimeToken({
          ...(data.language ? { overrides: { language: data.language } } : {}),
        }),
      })
    }

    if (data.provider === 'grok') {
      return realtimeToken({
        adapter: grokRealtimeToken({ model: 'grok-voice-think-fast-2.0' }),
      })
    }

    throw new Error(`Unknown provider: ${data.provider}`)
  })

// GPT-Live has no token. The browser sends its SDP offer here, and the
// server sends it to OpenAI. realtimeSession() checks the body.
const createLiveSessionFn = createServerFn({ method: 'POST' })
  .validator((data: RealtimeSessionRequest) => data)
  .handler(({ data }) =>
    realtimeSession({
      adapter: openaiLiveSession({
        // The tools run through delegation, so the server must set it.
        delegation: { model: 'gpt-6.1-terra' },
      }),
      request: data,
      // The client abort stops the OpenAI POST. ServerFnCtx has no signal.
      abortSignal: getRequest().signal,
    }),
  )

function connectionForProvider(provider: Provider, language?: string) {
  if (provider === 'openai-live') {
    return {
      adapter: openaiLive(),
      createSession: (
        request: RealtimeSessionRequest,
        abortSignal?: AbortSignal,
      ) =>
        createLiveSessionFn({
          data: request,
          ...(abortSignal ? { signal: abortSignal } : {}),
        }),
    }
  }
  return {
    adapter: adapterForProvider(provider),
    getToken: () =>
      getRealtimeTokenFn({
        data: {
          provider,
          ...(provider === 'elevenlabs' && language ? { language } : {}),
        },
      }),
  }
}

function defaultVoice(provider: Provider) {
  switch (provider) {
    case 'grok':
      return 'eve'
    case 'gemini':
      return 'Puck'
    case 'openai-live':
      return 'marin'
    case 'openai':
    case 'elevenlabs':
      return 'alloy'
  }
}

function adapterForProvider(provider: TokenProvider) {
  switch (provider) {
    case 'openai':
      return openaiRealtime()
    case 'elevenlabs':
      return elevenlabsRealtime()
    case 'gemini':
      return geminiRealtime()
    case 'grok':
      return grokRealtime()
  }
}

export function useRealtime({
  provider,
  language,
  voice,
  outputModalities,
  temperature,
  maxOutputTokens,
  semanticEagerness,
}: {
  provider: Provider
  language?: string
  voice?: string
  outputModalities?: Array<'audio' | 'text'>
  temperature?: number
  maxOutputTokens?: number | 'inf'
  semanticEagerness?: 'low' | 'medium' | 'high'
}) {
  return useRealtimeChat({
    ...connectionForProvider(provider, language),
    instructions: `You are a helpful, friendly voice assistant with access to several tools.

You can:
- Tell the user the current time and date (getCurrentTime)
- Get weather information for any location (getWeather)
- Set reminders for the user (setReminder)
- Search a knowledge base for information (searchKnowledge)

Keep your responses concise and conversational since this is a voice interface.
When using tools, briefly explain what you're doing and then share the results naturally.
${
  provider === 'openai-live'
    ? ''
    : 'If the user sends an image, describe what you see and answer any questions about it.\n'
}Be friendly and engaging!`,
    voice: voice ?? defaultVoice(provider),
    tools: realtimeClientTools,
    outputModalities,
    temperature,
    maxOutputTokens,
    semanticEagerness,
    onError: (err) => {
      console.error('Realtime error:', err)
    },
  })
}
