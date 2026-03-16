import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

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
function createSimulatorAdapter() {
  return {
    kind: 'text' as const,
    name: 'simulator',
    model: 'simulator-v1' as const,

    async *chatStream(options: any): AsyncIterable<StreamChunk> {
      const messages = options.messages
      const lastMessage = messages[messages.length - 1]
      const timestamp = Date.now()
      const runId = `run-${timestamp}`
      const messageId = `msg-${timestamp}`

      // Check if this is a tool result - if so, acknowledge it
      if (lastMessage?.role === 'tool') {
        yield {
          type: 'RUN_STARTED',
          runId,
          model: 'simulator-v1',
          timestamp,
        }

        yield {
          type: 'TEXT_MESSAGE_START',
          messageId,
          role: 'assistant',
          model: 'simulator-v1',
          timestamp,
        }

        // Generate acknowledgment response
        const content =
          'Tool execution completed. The result has been processed.'

        // Stream content character by character for realistic effect
        let accumulated = ''
        for (const char of content) {
          accumulated += char
          yield {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId,
            model: 'simulator-v1',
            timestamp,
            delta: char,
            content: accumulated,
          }
          // Small delay for streaming effect
          await new Promise((resolve) => setTimeout(resolve, 10))
        }

        yield {
          type: 'TEXT_MESSAGE_END',
          messageId,
          model: 'simulator-v1',
          timestamp: Date.now(),
        }

        yield {
          type: 'RUN_FINISHED',
          runId,
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

      yield {
        type: 'RUN_STARTED',
        runId,
        model: 'simulator-v1',
        timestamp,
      }

      if (validToolCalls.length === 0) {
        // No tool calls - echo the message back
        const echoContent = `[Echo] ${userContent}`

        yield {
          type: 'TEXT_MESSAGE_START',
          messageId,
          role: 'assistant',
          model: 'simulator-v1',
          timestamp,
        }

        // Stream content character by character
        let accumulated = ''
        for (const char of echoContent) {
          accumulated += char
          yield {
            type: 'TEXT_MESSAGE_CONTENT',
            messageId,
            model: 'simulator-v1',
            timestamp,
            delta: char,
            content: accumulated,
          }
          // Small delay for streaming effect
          await new Promise((resolve) => setTimeout(resolve, 15))
        }

        yield {
          type: 'TEXT_MESSAGE_END',
          messageId,
          model: 'simulator-v1',
          timestamp: Date.now(),
        }

        yield {
          type: 'RUN_FINISHED',
          runId,
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

          yield {
            type: 'TOOL_CALL_START',
            toolCallId,
            toolName: tc.name,
            parentMessageId: messageId,
            index: i,
            model: 'simulator-v1',
            timestamp,
          }

          for (const delta of argsJson) {
            yield {
              type: 'TOOL_CALL_ARGS',
              toolCallId,
              delta,
              model: 'simulator-v1',
              timestamp,
            }
          }
        }

        yield {
          type: 'RUN_FINISHED',
          runId,
          model: 'simulator-v1',
          timestamp: Date.now(),
          finishReason: 'tool_calls',
          usage: { promptTokens: 10, completionTokens: 50, totalTokens: 60 },
        }
      }
    },

    async structuredOutput() {
      throw new Error('Structured output not supported in simulator')
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
