import { createServerFn } from '@tanstack/react-start'
import { realtimeToken } from '@tanstack/ai'
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime, openaiRealtimeToken } from '@tanstack/ai-openai'
import {
  elevenlabsRealtime,
  elevenlabsRealtimeToken,
} from '@tanstack/ai-elevenlabs'
import { grokRealtime, grokRealtimeToken } from '@tanstack/ai-grok'
import { realtimeClientTools } from '@/lib/realtime-tools'

type Provider = 'openai' | 'elevenlabs' | 'grok'

const getRealtimeTokenFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { provider: Provider; agentId?: string }) => {
    if (!data.provider) throw new Error('Provider is required')
    return data
  })
  .handler(async ({ data }) => {
    if (data.provider === 'openai') {
      return realtimeToken({
        adapter: openaiRealtimeToken({
          model: 'gpt-4o-realtime-preview',
        }),
      })
    }

    if (data.provider === 'elevenlabs') {
      const agentId = data.agentId || process.env.ELEVENLABS_AGENT_ID
      if (!agentId) {
        throw new Error(
          'ElevenLabs agent ID is required. Set ELEVENLABS_AGENT_ID or pass agentId in request body.',
        )
      }
      return realtimeToken({
        adapter: elevenlabsRealtimeToken({ agentId }),
      })
    }

    if (data.provider === 'grok') {
      return realtimeToken({
        adapter: grokRealtimeToken({ model: 'grok-voice-fast-1.0' }),
      })
    }

    throw new Error(`Unknown provider: ${data.provider}`)
  })

function adapterForProvider(provider: Provider) {
  switch (provider) {
    case 'openai':
      return openaiRealtime()
    case 'elevenlabs':
      return elevenlabsRealtime()
    case 'grok':
      return grokRealtime()
  }
}

export function useRealtime({
  provider,
  agentId,
  voice,
  outputModalities,
  temperature,
  maxOutputTokens,
  semanticEagerness,
}: {
  provider: Provider
  agentId: string
  voice?: string
  outputModalities?: Array<'audio' | 'text'>
  temperature?: number
  maxOutputTokens?: number | 'inf'
  semanticEagerness?: 'low' | 'medium' | 'high'
}) {
  return useRealtimeChat({
    getToken: () =>
      getRealtimeTokenFn({
        data: {
          provider,
          ...(provider === 'elevenlabs' && agentId ? { agentId } : {}),
        },
      }),
    adapter: adapterForProvider(provider),
    instructions: `You are a helpful, friendly voice assistant with access to several tools.

You can:
- Tell the user the current time and date (getCurrentTime)
- Get weather information for any location (getWeather)
- Set reminders for the user (setReminder)
- Search a knowledge base for information (searchKnowledge)

Keep your responses concise and conversational since this is a voice interface.
When using tools, briefly explain what you're doing and then share the results naturally.
If the user sends an image, describe what you see and answer any questions about it.
Be friendly and engaging!`,
    voice: voice ?? (provider === 'grok' ? 'eve' : 'alloy'),
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
