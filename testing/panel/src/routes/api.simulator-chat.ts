import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  chat,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'

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

const MODEL = 'simulator-v1'

/**
 * Simulated LLM adapter that:
 * - Echoes messages back if no tool calls detected
 * - Parses tool call syntax and generates appropriate chunks
 *
 * Emits the standard AG-UI lifecycle events (`RUN_STARTED`,
 * `TEXT_MESSAGE_*` / `TOOL_CALL_*`, `RUN_FINISHED`) that the chat engine and
 * StreamProcessor consume. The return is cast to `any` at the call site, so
 * this only needs to be a structurally valid streaming text source.
 */
function createSimulatorAdapter() {
  // Stream a text message (start -> content deltas -> end) under one run.
  async function* streamText(
    text: string,
    delayMs: number,
  ): AsyncIterable<StreamChunk> {
    const timestamp = Date.now()
    const messageId = `sim-msg-${timestamp}`

    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      model: MODEL,
      timestamp,
      role: 'assistant',
    }

    let accumulated = ''
    for (const char of text) {
      accumulated += char
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        model: MODEL,
        timestamp,
        delta: char,
        content: accumulated,
      }
      // Small delay for streaming effect
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }

    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      model: MODEL,
      timestamp: Date.now(),
    }
  }

  return {
    name: 'simulator',
    model: MODEL,

    async *chatStream(options: {
      messages: Array<ModelMessage>
    }): AsyncIterable<StreamChunk> {
      const messages = options.messages
      const lastMessage = messages[messages.length - 1]

      const runId = `sim-run-${Date.now()}`
      const threadId = `sim-thread-${Date.now()}`

      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId,
        model: MODEL,
        timestamp: Date.now(),
      }

      // Check if this is a tool result - if so, acknowledge it
      if (lastMessage?.role === 'tool') {
        const content =
          'Tool execution completed. The result has been processed.'

        yield* streamText(content, 10)

        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          model: MODEL,
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

      if (validToolCalls.length === 0) {
        // No tool calls - echo the message back
        const echoContent = `[Echo] ${userContent}`

        yield* streamText(echoContent, 15)

        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          model: MODEL,
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
        const timestamp = Date.now()
        for (let i = 0; i < validToolCalls.length; i++) {
          const tc = validToolCalls[i]
          const toolCallId = `call-${timestamp}-${i}`
          const argsJson = JSON.stringify(tc.arguments)

          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId,
            toolCallName: tc.name,
            toolName: tc.name,
            model: MODEL,
            timestamp,
            index: i,
          }

          // Stream tool call arguments character by character
          let argsAccumulated = ''
          for (const char of argsJson) {
            argsAccumulated += char
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId,
              model: MODEL,
              timestamp,
              delta: char,
              args: argsAccumulated,
            }
            // Small delay for streaming effect
            await new Promise((resolve) => setTimeout(resolve, 5))
          }

          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId,
            toolCallName: tc.name,
            toolName: tc.name,
            model: MODEL,
            timestamp: Date.now(),
          }
        }

        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          model: MODEL,
          timestamp: Date.now(),
          finishReason: 'tool_calls',
          usage: { promptTokens: 10, completionTokens: 50, totalTokens: 60 },
        }
      }
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
