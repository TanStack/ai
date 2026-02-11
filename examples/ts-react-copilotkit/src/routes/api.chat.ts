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
 *
 * This function supports multiple message formats:
 * 1. Direct content: { role: 'user', content: 'Hello' }
 * 2. Parts array: { role: 'user', parts: [{ type: 'text', content: 'Hello' }] }
 */
function convertAGUIMessages(
  agUIMessages: Array<{
    id?: string
    role: string
    content?: string
    parts?: Array<{ type: string; content?: string }>
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
      // Extract content from either direct content field or parts array
      let content = msg.content || ''
      if (!content && msg.parts) {
        const textParts = msg.parts.filter((p) => p.type === 'text')
        content = textParts.map((p) => p.content || '').join('')
      }

      switch (msg.role) {
        case 'user':
          return {
            role: 'user',
            content,
          }
        case 'assistant':
          return {
            role: 'assistant',
            content,
            toolCalls: msg.toolCalls?.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: tc.function || { name: '', arguments: '{}' },
            })),
          }
        case 'tool':
          return {
            role: 'tool',
            content,
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
      GET: async () => {
        // Support GET requests for runtime info discovery
        return new Response(
          JSON.stringify({
            agents: [
              {
                id: 'tanstack-ai',
                name: 'tanstack-ai',
                description: 'TanStack AI agent connected via AG-UI protocol',
                capabilities: ['chat', 'sse', 'ag-ui-protocol'],
              },
            ],
            provider: 'tanstack-ai',
            version: '1.0.0',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      },

      POST: async ({ request }) => {
        const requestSignal = request.signal

        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()

        let body: any
        try {
          body = await request.json()
        } catch (e) {
          console.error('[API] Failed to parse request body:', e)
          return new Response(
            JSON.stringify({
              error: 'Failed to parse request body as JSON',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        // Support both TanStack AI format and AG-UI RunAgentInput format
        let rawMessages = body.messages || body.history || []
        console.log(
          '[API] Raw messages received:',
          JSON.stringify(rawMessages, null, 2),
        )
        const messages = convertAGUIMessages(rawMessages)
        console.log(
          '[API] Converted messages:',
          JSON.stringify(messages, null, 2),
        )

        // Validate that we have messages
        if (messages.length === 0) {
          return new Response(
            JSON.stringify({
              error: 'No valid messages provided. Expected at least one user or assistant message.',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

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
            // Type assertion needed: AG-UI messages are converted to ModelMessage
            // with string content, which is compatible at runtime with all adapter
            // modalities, but TypeScript's constrained generic types require a cast.
            messages: messages as any, // eslint-disable-line @typescript-eslint/no-explicit-any
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
