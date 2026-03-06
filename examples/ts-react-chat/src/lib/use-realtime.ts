import { createServerFn } from '@tanstack/react-start'
import { realtimeToken } from '@tanstack/ai'
import { useRealtimeChat } from '@tanstack/ai-react'
import { openaiRealtime, openaiRealtimeToken } from '@tanstack/ai-openai'
import {
  elevenlabsRealtime,
  elevenlabsRealtimeToken,
} from '@tanstack/ai-elevenlabs'
import { realtimeClientTools } from '@/lib/realtime-tools'

type Provider = 'openai' | 'elevenlabs'

const getRealtimeTokenFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { provider: Provider; agentId?: string }) => {
      if (!data.provider) throw new Error('Provider is required')
      return data
    },
  )
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

    throw new Error(`Unknown provider: ${data.provider}`)
  })

export function useRealtime({
  provider,
  agentId,
}: {
  provider: Provider
  agentId: string
}) {
  const adapter =
    provider === 'openai' ? openaiRealtime() : elevenlabsRealtime()

  return useRealtimeChat({
    getToken: () =>
      getRealtimeTokenFn({
        data: {
          provider,
          ...(provider === 'elevenlabs' && agentId ? { agentId } : {}),
        },
      }),
    adapter,
    instructions: `You are a helpful, friendly voice assistant with access to several tools.

You can:
- Tell the user the current time and date (getCurrentTime)
- Get weather information for any location (getWeather)
- Set reminders for the user (setReminder)
- Search a knowledge base for information (searchKnowledge)

Keep your responses concise and conversational since this is a voice interface.
When using tools, briefly explain what you're doing and then share the results naturally.
Be friendly and engaging!`,
    voice: 'alloy',
    tools: realtimeClientTools,
    onError: (err) => {
      console.error('Realtime error:', err)
    },
  })
}
