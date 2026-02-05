import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import type { AIAdapter, ChatOptions, StreamChunk } from '@tanstack/ai'

import {
  clientServerTool,
  clientServerToolWithApproval,
  clientToolDef,
  clientToolWithApprovalDef,
  serverTool,
  serverToolWithApproval,
} from '@/lib/simulator-tools'

/**
 * Tool call syntax: toolName({ arg: value, arg2: value2 })
 * Multiple calls can be separated by newlines or semicolons
 *
 * Examples:
 *   serverTool({ text: "hello" })
 *   clientTool({ delay: 2 })
 *   serverToolWithApproval({ text: "needs approval", delay: 1 })
 */
const TOOL_CALL_REGEX = /(\w+)\s*\(\s*(\{[^}]*\})\s*\)/g

interface ParsedToolCall {
  name: string
  arguments: Record<string, any>
}

function parseToolCalls(message: string): Array<ParsedToolCall> {
  TOOL_CALL_REGEX.lastIndex = 0
  const toolCalls: Array<ParsedToolCall> = []
  let match

  while ((match = TOOL_CALL_REGEX.exec(message)) !== null) {
    const name = match[1]
    const argsString = match[2]

    try {
      // Parse the JSON-like arguments
      // Handle simple cases like { text: "hello" } by converting to proper JSON
      const jsonArgs = argsString.replace(/(\w+)\s*:/g, '"$1":')
      const args = JSON.parse(jsonArgs)
      toolCalls.push({ name, arguments: args })
    } catch {
      // If parsing fails, try to parse as-is
      try {
        const args = JSON.parse(argsString)
        toolCalls.push({ name, arguments: args })
      } catch {
        console.error(`Failed to parse tool call arguments: ${argsString}`)
      }
    }
  }

  return toolCalls
}

// Valid tool names
const VALID_TOOLS = new Set([
  'serverTool',
  'serverToolWithApproval',
  'clientTool',
  'clientToolWithApproval',
  'clientServerTool',
  'clientServerToolWithApproval',
])

/**
 * Simulated LLM adapter that:
 * - Echoes messages back if no tool calls detected
 * - Parses tool call syntax and generates appropriate chunks
 */
function createSimulatorAdapter(): AIAdapter {
  return {
    name: 'simulator',
    models: ['simulator-v1'] as const,
    _modelProviderOptionsByName: {},

    async *chatStream(options: ChatOptions): AsyncIterable<StreamChunk> {
      const messages = options.messages
      const lastMessage = messages[messages.length - 1]

      // Check if this is a tool result - if so, acknowledge it
      if (lastMessage?.role === 'tool') {
        const timestamp = Date.now()
        const id = `sim-${timestamp}`

        // Generate acknowledgment response
        const content =
          'Tool execution completed. The result has been processed.'

        // Stream content character by character for realistic effect
        let accumulated = ''
        for (const char of content) {
          accumulated += char
          yield {
            type: 'content',
            id,
            model: 'simulator-v1',
            timestamp,
            delta: char,
            content: accumulated,
            role: 'assistant',
          }
          // Small delay for streaming effect
          await new Promise((resolve) => setTimeout(resolve, 10))
        }

        yield {
          type: 'done',
          id,
          model: 'simulator-v1',
          timestamp: Date.now(),
          finishReason: 'stop',
          usage: {
            promptTokens: 10,
            completionTokens: content.length,
            totalTokens: 10 + content.length,
          },
        }
        return
      }

      // Get the user's message content
      const userContent =
        typeof lastMessage?.content === 'string'
          ? lastMessage.content
          : Array.isArray(lastMessage?.content)
            ? lastMessage.content
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.content)
                .join(' ')
            : ''

      // Parse for tool calls
      const toolCalls = parseToolCalls(userContent)
      const validToolCalls = toolCalls.filter((tc) => VALID_TOOLS.has(tc.name))

      const timestamp = Date.now()
      const id = `sim-${timestamp}`

      if (validToolCalls.length === 0) {
        // No tool calls - echo the message back
        const echoContent = `[Echo] ${userContent}`

        // Stream content character by character
        let accumulated = ''
        for (const char of echoContent) {
          accumulated += char
          yield {
            type: 'content',
            id,
            model: 'simulator-v1',
            timestamp,
            delta: char,
            content: accumulated,
            role: 'assistant',
          }
          // Small delay for streaming effect
          await new Promise((resolve) => setTimeout(resolve, 15))
        }

        yield {
          type: 'done',
          id,
          model: 'simulator-v1',
          timestamp: Date.now(),
          finishReason: 'stop',
          usage: {
            promptTokens: 10,
            completionTokens: echoContent.length,
            totalTokens: 10 + echoContent.length,
          },
        }
      } else {
        // Generate tool calls
        for (let i = 0; i < validToolCalls.length; i++) {
          const tc = validToolCalls[i]
          const toolCallId = `call-${timestamp}-${i}`
          const argsJson = JSON.stringify(tc.arguments)

          // Stream tool call arguments character by character
          // The arguments field contains the DELTA (incremental), not accumulated
          for (const char of argsJson) {
            yield {
              type: 'tool_call',
              id,
              model: 'simulator-v1',
              timestamp,
              toolCall: {
                id: toolCallId,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: char, // Delta only, not accumulated
                },
              },
              index: i,
            }
            // Small delay for streaming effect
            await new Promise((resolve) => setTimeout(resolve, 5))
          }
        }

        yield {
          type: 'done',
          id,
          model: 'simulator-v1',
          timestamp: Date.now(),
          finishReason: 'tool_calls',
          usage: { promptTokens: 10, completionTokens: 50, totalTokens: 60 },
        }
      }
    },

    async summarize() {
      throw new Error('Summarize not supported in simulator')
    },

    async createEmbeddings() {
      throw new Error('Embeddings not supported in simulator')
    },
  }
}

export const Route = createFileRoute('/api/simulator-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const messages = body.messages

        try {
          const adapter = createSimulatorAdapter()

          const stream = chat({
            adapter: adapter as any,
            model: 'simulator-v1',
            tools: [
              // Server tools with implementations
              serverTool,
              serverToolWithApproval,
              clientServerTool,
              clientServerToolWithApproval,
              // Client-only tools (no server execute)
              clientToolDef,
              clientToolWithApprovalDef,
            ],
            systemPrompts: [],
            agentLoopStrategy: maxIterations(10),
            messages,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[Simulator API] Error:', error)
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(
            JSON.stringify({ error: error.message || 'An error occurred' }),
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
