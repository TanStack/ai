import { describe, expect, it, vi } from 'vitest'
import { chat, maxIterations, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { SimulatorScripts, createLLMSimulator } from '../../llm-simulator'
import type { SimulatorScript } from '../../llm-simulator'

/**
 * Helper to collect all chunks from a stream
 */
async function collectChunks<T>(stream: AsyncIterable<T>): Promise<Array<T>> {
  const chunks: Array<T> = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

describe('Client Tool Tests', () => {
  describe('Client Tool Without Execute (Definition Only)', () => {
    it('should emit tool-input-available for client tool without execute', async () => {
      const script = SimulatorScripts.singleClientTool(
        'show_notification',
        { message: 'Hello World', type: 'info' },
        'I have shown the notification.',
      )
      const adapter = createLLMSimulator(script)

      // Client tool definition without execute function
      const notificationTool = toolDefinition({
        name: 'show_notification',
        description: 'Show a notification to the user',
        inputSchema: z.object({
          message: z.string(),
          type: z.enum(['info', 'warning', 'error']),
        }),
      }).client() // No execute function - client will handle it

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Show me a hello notification' }],
        tools: [notificationTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Should have TOOL_CALL_START chunks
      const toolCallChunks = chunks.filter((c) => c.type === 'TOOL_CALL_START')
      expect(toolCallChunks.length).toBeGreaterThan(0)

      // Should have tool-input-available chunks (for client-side handling, emitted as CUSTOM event)
      const inputAvailableChunks = chunks.filter(
        (c: any) => c.type === 'CUSTOM' && c.name === 'tool-input-available',
      )
      expect(inputAvailableChunks.length).toBe(1)

      const inputChunk = inputAvailableChunks[0] as any
      expect(inputChunk.data.toolName).toBe('show_notification')
      expect(inputChunk.data.input).toEqual({
        message: 'Hello World',
        type: 'info',
      })
    })

    it('should stop iteration when client tool needs input', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'I need to show something on screen.',
            toolCalls: [
              { name: 'render_component', arguments: { component: 'Chart' } },
            ],
          },
          {
            // This iteration should NOT be reached until client provides result
            content: 'The component has been rendered.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const clientTool = toolDefinition({
        name: 'render_component',
        description: 'Render a UI component',
        inputSchema: z.object({ component: z.string() }),
      }).client() // No execute - waits for client

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Show me a chart' }],
        tools: [clientTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // The stream should stop after first iteration (waiting for client)
      const finishedChunks = chunks.filter((c) => c.type === 'RUN_FINISHED')
      expect(finishedChunks.length).toBeGreaterThanOrEqual(1)

      // Should have tool-input-available (emitted as CUSTOM event)
      const inputChunks = chunks.filter(
        (c: any) => c.type === 'CUSTOM' && c.name === 'tool-input-available',
      )
      expect(inputChunks.length).toBe(1)

      // Simulator should still be on iteration 1 (not advanced)
      expect(adapter.getCurrentIteration()).toBe(1)
    })
  })

  describe('Client Tool With Execute', () => {
    it('should execute client tool with execute function', async () => {
      const script = SimulatorScripts.singleClientTool(
        'get_location',
        {},
        'You are in New York.',
      )
      const adapter = createLLMSimulator(script)

      const executeFn = vi.fn(async () => {
        return { latitude: 40.7128, longitude: -74.006, city: 'New York' }
      })

      const locationTool = toolDefinition({
        name: 'get_location',
        description: 'Get current location',
        inputSchema: z.object({}),
        outputSchema: z.object({
          latitude: z.number(),
          longitude: z.number(),
          city: z.string(),
        }),
      }).client(executeFn)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Where am I?' }],
        tools: [locationTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Client tool with execute should behave like server tool
      expect(executeFn).toHaveBeenCalledTimes(1)

      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(1)

      const result = JSON.parse((toolResultChunks[0] as any).result)
      expect(result.city).toBe('New York')
    })
  })

  describe('Simulating Client Tool Results (Message Injection)', () => {
    it('should continue when client tool result is provided via messages', async () => {
      // This simulates what happens when client sends back tool result
      const script: SimulatorScript = {
        iterations: [
          {
            // LLM will receive the tool result and respond
            content:
              'Based on the uploaded file, I can see it contains 100 lines.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const uploadTool = toolDefinition({
        name: 'upload_file',
        description: 'Upload a file',
        inputSchema: z.object({ filename: z.string() }),
      }).client() // No execute - client handles

      // Simulate messages with tool result already present
      // (as if client had previously provided the result)
      const messagesWithToolResult = [
        { role: 'user' as const, content: 'Upload my file' },
        {
          role: 'assistant' as const,
          content: 'I will upload the file for you.',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function' as const,
              function: {
                name: 'upload_file',
                arguments: '{"filename":"test.txt"}',
              },
            },
          ],
          parts: [
            {
              type: 'tool-call' as const,
              id: 'call-1',
              name: 'upload_file',
              arguments: '{"filename":"test.txt"}',
              state: 'complete' as const,
              output: { success: true, lines: 100 },
            },
          ],
        },
      ]

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: messagesWithToolResult,
        tools: [uploadTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Should get the response content
      const contentChunks = chunks.filter(
        (c) => c.type === 'TEXT_MESSAGE_CONTENT',
      )
      expect(contentChunks.length).toBeGreaterThan(0)

      const fullContent = contentChunks.map((c) => (c as any).content).join('')
      expect(fullContent).toContain('100 lines')
    })
  })

  describe('Mixed Client Tools', () => {
    it('should handle multiple client tools with different states', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'Let me help with both tasks.',
            toolCalls: [
              { name: 'client_tool_a', arguments: { value: 'A' } },
              { name: 'client_tool_b', arguments: { value: 'B' } },
            ],
          },
          {
            content: 'Both tasks completed.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      // One client tool with execute, one without
      const toolA = toolDefinition({
        name: 'client_tool_a',
        description: 'Tool A',
        inputSchema: z.object({ value: z.string() }),
      }).client(async (args) => ({ processed: args.value }))

      const toolB = toolDefinition({
        name: 'client_tool_b',
        description: 'Tool B',
        inputSchema: z.object({ value: z.string() }),
      }).client() // No execute

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Do both' }],
        tools: [toolA, toolB],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Tool B should have tool-input-available (no execute, emitted as CUSTOM event)
      const inputChunks = chunks.filter(
        (c: any) => c.type === 'CUSTOM' && c.name === 'tool-input-available',
      )
      expect(inputChunks.length).toBeGreaterThanOrEqual(1)

      // At least one should be for tool_b
      const toolBInputs = inputChunks.filter(
        (c: any) => c.data?.toolName === 'client_tool_b',
      )
      expect(toolBInputs.length).toBe(1)
    })
  })
})
