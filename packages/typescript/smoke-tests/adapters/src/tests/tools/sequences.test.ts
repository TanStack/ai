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

describe('Tool Sequence Tests', () => {
  describe('Server Tool -> Server Tool', () => {
    it('should execute sequential server tools', async () => {
      const script = SimulatorScripts.sequentialTools(
        { name: 'get_user', args: { userId: '123' } },
        { name: 'get_orders', args: { userId: '123' } },
        'User has 5 orders.',
      )
      const adapter = createLLMSimulator(script)

      const getUserExecute = vi.fn(async (args: { userId: string }) => {
        return JSON.stringify({ id: args.userId, name: 'John' })
      })

      const getOrdersExecute = vi.fn(async (args: { userId: string }) => {
        return JSON.stringify({ orders: [1, 2, 3, 4, 5], count: 5 })
      })

      const getUserTool = toolDefinition({
        name: 'get_user',
        description: 'Get user by ID',
        inputSchema: z.object({ userId: z.string() }),
      }).server(getUserExecute)

      const getOrdersTool = toolDefinition({
        name: 'get_orders',
        description: 'Get orders for user',
        inputSchema: z.object({ userId: z.string() }),
      }).server(getOrdersExecute)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Get orders for user 123' }],
        tools: [getUserTool, getOrdersTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Both tools should be executed in sequence
      expect(getUserExecute).toHaveBeenCalledTimes(1)
      expect(getOrdersExecute).toHaveBeenCalledTimes(1)

      // Verify call order
      expect(getUserExecute.mock.invocationCallOrder[0]).toBeLessThan(
        getOrdersExecute.mock.invocationCallOrder[0]!,
      )

      // Should have 2 tool results
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(2)
    })

    it('should pass first tool result to context for second tool', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'Let me fetch the data.',
            toolCalls: [{ name: 'fetch_data', arguments: { source: 'api' } }],
          },
          {
            content: 'Now I will process it.',
            toolCalls: [
              { name: 'process_data', arguments: { format: 'json' } },
            ],
          },
          {
            content: 'Data processed successfully.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      let fetchResult = ''
      const fetchExecute = vi.fn(async () => {
        fetchResult = JSON.stringify({ raw: 'data123' })
        return fetchResult
      })

      const processExecute = vi.fn(async () => {
        // In a real scenario, this would use the fetch result
        return JSON.stringify({ processed: true })
      })

      const fetchTool = toolDefinition({
        name: 'fetch_data',
        description: 'Fetch data',
        inputSchema: z.object({ source: z.string() }),
      }).server(fetchExecute)

      const processTool = toolDefinition({
        name: 'process_data',
        description: 'Process data',
        inputSchema: z.object({ format: z.string() }),
      }).server(processExecute)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Fetch and process data' }],
        tools: [fetchTool, processTool],
        agentLoopStrategy: maxIterations(10),
      })

      await collectChunks(stream)

      expect(fetchExecute).toHaveBeenCalledTimes(1)
      expect(processExecute).toHaveBeenCalledTimes(1)

      // Process should be called after fetch
      expect(fetchExecute.mock.invocationCallOrder[0]).toBeLessThan(
        processExecute.mock.invocationCallOrder[0]!,
      )
    })
  })

  describe('Server Tool -> Client Tool', () => {
    it('should execute server tool then request client tool input', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'First, let me check the data.',
            toolCalls: [{ name: 'server_check', arguments: { id: 'abc' } }],
          },
          {
            content: 'Now please confirm on screen.',
            toolCalls: [
              { name: 'client_confirm', arguments: { message: 'Proceed?' } },
            ],
          },
          {
            content: 'Great, all done!',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const serverExecute = vi.fn(async () => JSON.stringify({ valid: true }))

      const serverTool = toolDefinition({
        name: 'server_check',
        description: 'Server-side check',
        inputSchema: z.object({ id: z.string() }),
      }).server(serverExecute)

      const clientTool = toolDefinition({
        name: 'client_confirm',
        description: 'Client-side confirmation',
        inputSchema: z.object({ message: z.string() }),
      }).client() // No execute - handled by client

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Check and confirm' }],
        tools: [serverTool, clientTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Server tool should execute
      expect(serverExecute).toHaveBeenCalledTimes(1)

      // Should have tool result for server tool
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(1)

      // Should have tool-input-available for client tool (emitted as CUSTOM event)
      const inputChunks = chunks.filter(
        (c: any) => c.type === 'CUSTOM' && c.name === 'tool-input-available',
      )
      expect(inputChunks.length).toBe(1)
      expect((inputChunks[0] as any).data.toolName).toBe('client_confirm')
    })
  })

  describe('Client Tool -> Server Tool', () => {
    it('should execute client tool result then continue to server tool', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'Now I will process on server.',
            toolCalls: [
              { name: 'server_process', arguments: { data: 'processed' } },
            ],
          },
          {
            content: 'Processing complete.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const serverExecute = vi.fn(async (args: any) => {
        return { result: args.data + '_done' }
      })

      const clientTool = toolDefinition({
        name: 'client_collect',
        description: 'Collect input from client',
        inputSchema: z.object({}),
      }).client()

      const serverTool = toolDefinition({
        name: 'server_process',
        description: 'Process on server',
        inputSchema: z.object({ data: z.string() }),
      }).server(serverExecute)

      // Simulate that client tool already completed
      const messagesWithClientResult = [
        { role: 'user' as const, content: 'Collect and process' },
        {
          role: 'assistant' as const,
          content: 'Let me collect your input.',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function' as const,
              function: {
                name: 'client_collect',
                arguments: '{}',
              },
            },
          ],
          parts: [
            {
              type: 'tool-call' as const,
              id: 'call-1',
              name: 'client_collect',
              arguments: '{}',
              state: 'complete' as const,
              output: { userInput: 'client_data' },
            },
          ],
        },
      ]

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: messagesWithClientResult,
        tools: [clientTool, serverTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Server tool should execute
      expect(serverExecute).toHaveBeenCalledTimes(1)
      expect(serverExecute).toHaveBeenCalledWith({ data: 'processed' })

      // Should have tool results (may include the client tool result that was injected)
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Three Tool Sequence', () => {
    it('should handle A -> B -> C tool sequence', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'Step 1',
            toolCalls: [{ name: 'tool_a', arguments: { step: 1 } }],
          },
          {
            content: 'Step 2',
            toolCalls: [{ name: 'tool_b', arguments: { step: 2 } }],
          },
          {
            content: 'Step 3',
            toolCalls: [{ name: 'tool_c', arguments: { step: 3 } }],
          },
          {
            content: 'All three steps completed.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const callOrder: Array<string> = []

      const toolA = toolDefinition({
        name: 'tool_a',
        description: 'Tool A',
        inputSchema: z.object({ step: z.number() }),
      }).server(async () => {
        callOrder.push('A')
        return 'A done'
      })

      const toolB = toolDefinition({
        name: 'tool_b',
        description: 'Tool B',
        inputSchema: z.object({ step: z.number() }),
      }).server(async () => {
        callOrder.push('B')
        return 'B done'
      })

      const toolC = toolDefinition({
        name: 'tool_c',
        description: 'Tool C',
        inputSchema: z.object({ step: z.number() }),
      }).server(async () => {
        callOrder.push('C')
        return 'C done'
      })

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Do A, B, C' }],
        tools: [toolA, toolB, toolC],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // All tools should execute in order
      expect(callOrder).toEqual(['A', 'B', 'C'])

      // Should have 3 tool results
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(3)
    })
  })

  describe('Parallel Tools in Sequence', () => {
    it('should handle parallel tools followed by another tool', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'First, getting data from two sources.',
            toolCalls: [
              { name: 'source_a', arguments: {} },
              { name: 'source_b', arguments: {} },
            ],
          },
          {
            content: 'Now combining results.',
            toolCalls: [{ name: 'combine', arguments: {} }],
          },
          {
            content: 'Here are the combined results.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const callOrder: Array<string> = []

      const sourceA = toolDefinition({
        name: 'source_a',
        description: 'Source A',
        inputSchema: z.object({}),
      }).server(async () => {
        callOrder.push('A')
        return JSON.stringify({ source: 'A', data: [1, 2] })
      })

      const sourceB = toolDefinition({
        name: 'source_b',
        description: 'Source B',
        inputSchema: z.object({}),
      }).server(async () => {
        callOrder.push('B')
        return JSON.stringify({ source: 'B', data: [3, 4] })
      })

      const combine = toolDefinition({
        name: 'combine',
        description: 'Combine data',
        inputSchema: z.object({}),
      }).server(async () => {
        callOrder.push('combine')
        return JSON.stringify({ combined: [1, 2, 3, 4] })
      })

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Get and combine data' }],
        tools: [sourceA, sourceB, combine],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // A and B should be called before combine
      expect(callOrder.indexOf('A')).toBeLessThan(callOrder.indexOf('combine'))
      expect(callOrder.indexOf('B')).toBeLessThan(callOrder.indexOf('combine'))

      // Should have 3 tool results
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(3)
    })
  })
})
