import type { ConnectionAdapter } from '@tanstack/ai-client'
import type { StreamChunk } from '@tanstack/ai'

export function createMockConnection(
  chunks: Array<StreamChunk>,
): ConnectionAdapter {
  return {
    connect: async function* (messages, body, signal) {
      for (const chunk of chunks) {
        if (signal.aborted) {
          throw new Error('AbortError')
        }
        yield chunk
        // Small delay to simulate network
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    },
  }
}

export function createTextChunk(content: string): StreamChunk {
  return {
    type: 'text-delta',
    textDelta: content,
  }
}

export function createToolCallChunk(
  id: string,
  name: string,
  args: string,
): StreamChunk {
  return {
    type: 'tool-call-delta',
    toolCallId: id,
    toolName: name,
    argsTextDelta: args,
  }
}
