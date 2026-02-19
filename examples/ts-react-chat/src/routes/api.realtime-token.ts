import { createFileRoute } from '@tanstack/react-router'
import { realtimeToken } from '@tanstack/ai'
import { openaiRealtimeToken } from '@tanstack/ai-openai'
import { elevenlabsRealtimeToken } from '@tanstack/ai-elevenlabs'
import {
  getCurrentTimeToolDef,
  getWeatherToolDef,
  setReminderToolDef,
  searchKnowledgeToolDef,
} from '@/lib/realtime-tools'
import * as z from 'zod'

type Provider = 'openai' | 'elevenlabs'

// Convert tool definitions to OpenAI's format using Zod's native toJSONSchema
function toolDefToOpenAI(toolDef: {
  name: string
  description: string
  inputSchema?: unknown
}) {
  let parameters: Record<string, unknown> = { type: 'object', properties: {} }

  if (toolDef.inputSchema) {
    // Use Zod's native toJSONSchema for Zod v4+
    const jsonSchema = z.toJSONSchema(toolDef.inputSchema as z.ZodType)
    // Remove $schema as OpenAI doesn't need it
    const { $schema, ...rest } = jsonSchema as Record<string, unknown>
    parameters = rest
  }

  return {
    type: 'function' as const,
    name: toolDef.name,
    description: toolDef.description,
    parameters,
  }
}

export const Route = createFileRoute('/api/realtime-token')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const provider: Provider = body.provider || 'openai'

          let token

          if (provider === 'openai') {
            // Convert tool definitions to OpenAI format
            const tools = [
              toolDefToOpenAI(getCurrentTimeToolDef),
              toolDefToOpenAI(getWeatherToolDef),
              toolDefToOpenAI(setReminderToolDef),
              toolDefToOpenAI(searchKnowledgeToolDef),
            ]

            token = await realtimeToken({
              adapter: openaiRealtimeToken({
                model: 'gpt-4o-realtime-preview',
                voice: 'alloy',
                instructions: `You are a helpful, friendly voice assistant with access to several tools.

You can:
- Tell the user the current time and date (getCurrentTime)
- Get weather information for any location (getWeather)
- Set reminders for the user (setReminder)
- Search a knowledge base for information (searchKnowledge)

Keep your responses concise and conversational since this is a voice interface.
When using tools, briefly explain what you're doing and then share the results naturally.
Be friendly and engaging!`,
                turnDetection: {
                  type: 'server_vad',
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                },
                inputAudioTranscription: {
                  model: 'whisper-1',
                },
                tools,
                toolChoice: 'auto',
              }),
            })
          } else if (provider === 'elevenlabs') {
            const agentId = body.agentId || process.env.ELEVENLABS_AGENT_ID

            if (!agentId) {
              return new Response(
                JSON.stringify({
                  error:
                    'ElevenLabs agent ID is required. Set ELEVENLABS_AGENT_ID or pass agentId in request body.',
                }),
                {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' },
                },
              )
            }

            token = await realtimeToken({
              adapter: elevenlabsRealtimeToken({
                agentId,
              }),
            })
          } else {
            return new Response(
              JSON.stringify({ error: `Unknown provider: ${provider}` }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          return new Response(JSON.stringify(token), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          console.error('[Realtime Token API] Error:', error)
          return new Response(
            JSON.stringify({
              error: error.message || 'Failed to generate realtime token',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
