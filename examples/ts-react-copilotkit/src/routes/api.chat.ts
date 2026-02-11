import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  createChatOptions,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import type { ModelMessage } from '@tanstack/ai'

/**
 * Convert AG-UI protocol messages to TanStack AI ModelMessage format.
 *
 * The AG-UI protocol defines messages with roles: user, assistant, system, developer, tool.
 * TanStack AI uses: user, assistant, tool (system prompts are handled separately).
 */
function convertAGUIMessages(
  agUIMessages: Array<{
    id?: string
    role: string
    content?: string
    toolCalls?: Array<{
      id: string
      type?: string
      function?: { name: string; arguments: string }
    }>
    toolCallId?: string
    name?: string
  }>,
): Array<ModelMessage> {
  return agUIMessages
    .map((msg): ModelMessage | null => {
      switch (msg.role) {
        case 'user':
          return {
            role: 'user',
            content: msg.content || '',
          }
        case 'assistant':
          return {
            role: 'assistant',
            content: msg.content || '',
            toolCalls: msg.toolCalls?.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: tc.function || { name: '', arguments: '{}' },
            })),
          }
        case 'tool':
          return {
            role: 'tool',
            content: msg.content || '',
            toolCallId: msg.toolCallId,
            name: msg.name,
          }
        case 'system':
        case 'developer':
          // System/developer messages are handled via systemPrompts
          return null
        default:
          return null
      }
    })
    .filter((msg): msg is ModelMessage => msg !== null)
}

const SYSTEM_PROMPT = `You are a helpful AI assistant powered by TanStack AI.
You are being served through the AG-UI protocol, which enables interoperability
between different AI frameworks. In this demo, TanStack AI handles the server-side
AI processing, and CopilotKit provides the client-side chat UI.

Be concise and helpful in your responses.`

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal

        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()

        const body = await request.json()

        // Support both TanStack AI format and AG-UI RunAgentInput format
        const rawMessages = body.messages || []
        const messages = convertAGUIMessages(rawMessages)

        // Extract system messages from AG-UI input to use as system prompts
        const systemMessages = rawMessages
          .filter(
            (m: { role: string }) =>
              m.role === 'system' || m.role === 'developer',
          )
          .map((m: { content: string }) => m.content)

        const systemPrompts =
          systemMessages.length > 0 ? systemMessages : [SYSTEM_PROMPT]

        try {
          const options = createChatOptions({
            adapter: openaiText('gpt-4o'),
          })

          const stream = chat({
            ...options,
            systemPrompts,
            agentLoopStrategy: maxIterations(10),
            messages: messages as any,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: unknown) {
          const err = error as Error & {
            status?: number
            statusText?: string
            code?: string
            type?: string
          }
          console.error('[API Route] Error in chat request:', {
            message: err?.message,
            name: err?.name,
            status: err?.status,
            stack: err?.stack,
          })

          if (
            err.name === 'AbortError' ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }

          return new Response(
            JSON.stringify({
              error: err.message || 'An error occurred',
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
