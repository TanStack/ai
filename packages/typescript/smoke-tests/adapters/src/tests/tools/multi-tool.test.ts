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

describe('Multi-Tool Tests', () => {
  describe('Parallel Tool Execution', () => {
    it('should execute multiple tools in the same iteration', async () => {
      const script = SimulatorScripts.parallelTools(
        [
          { name: 'get_weather', args: { city: 'NYC' } },
          { name: 'get_time', args: { timezone: 'EST' } },
          { name: 'get_news', args: { category: 'tech' } },
        ],
        'Here is the weather, time, and news.',
      )
      const adapter = createLLMSimulator(script)

      const weatherExecute = vi.fn(async () =>
        JSON.stringify({ temp: 72, condition: 'sunny' }),
      )
      const timeExecute = vi.fn(async () =>
        JSON.stringify({ time: '14:30', timezone: 'EST' }),
      )
      const newsExecute = vi.fn(async () =>
        JSON.stringify({ headlines: ['AI advances'] }),
      )

      const weatherTool = toolDefinition({
        name: 'get_weather',
        description: 'Get weather',
        inputSchema: z.object({ city: z.string() }),
      }).server(weatherExecute)

      const timeTool = toolDefinition({
        name: 'get_time',
        description: 'Get time',
        inputSchema: z.object({ timezone: z.string() }),
      }).server(timeExecute)

      const newsTool = toolDefinition({
        name: 'get_news',
        description: 'Get news',
        inputSchema: z.object({ category: z.string() }),
      }).server(newsExecute)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [
          { role: 'user', content: 'Give me weather, time, and news' },
        ],
        tools: [weatherTool, timeTool, newsTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // All three tools should be executed
      expect(weatherExecute).toHaveBeenCalledTimes(1)
      expect(timeExecute).toHaveBeenCalledTimes(1)
      expect(newsExecute).toHaveBeenCalledTimes(1)

      // Should have 3 tool results
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(3)

      // Should have 3 tool calls
      const toolCallChunks = chunks.filter((c) => c.type === 'TOOL_CALL_START')
      expect(toolCallChunks.length).toBe(3)
    })

    it('should handle different tool types in parallel', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'Executing multiple operations.',
            toolCalls: [
              { name: 'server_tool', arguments: { value: 1 } },
              { name: 'approval_tool', arguments: { action: 'delete' } },
              { name: 'client_tool', arguments: { display: 'chart' } },
            ],
          },
          {
            content: 'Operations initiated.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const serverExecute = vi.fn(async () => ({ result: 'server done' }))
      const approvalExecute = vi.fn(async () => ({
        result: 'approved action done',
      }))

      const serverTool = toolDefinition({
        name: 'server_tool',
        description: 'Server tool',
        inputSchema: z.object({ value: z.number() }),
      }).server(serverExecute)

      const approvalTool = toolDefinition({
        name: 'approval_tool',
        description: 'Approval tool',
        inputSchema: z.object({ action: z.string() }),
        needsApproval: true,
      }).server(approvalExecute)

      const clientTool = toolDefinition({
        name: 'client_tool',
        description: 'Client tool',
        inputSchema: z.object({ display: z.string() }),
      }).client() // No execute

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Do all three' }],
        tools: [serverTool, approvalTool, clientTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Server tool should execute
      expect(serverExecute).toHaveBeenCalledTimes(1)

      // Approval tool should NOT execute (waiting for approval)
      expect(approvalExecute).not.toHaveBeenCalled()

      // Should have approval-requested for approval tool (emitted as CUSTOM event)
      const approvalChunks = chunks.filter(
        (c: any) => c.type === 'CUSTOM' && c.name === 'approval-requested',
      )
      expect(approvalChunks.length).toBe(1)

      // Should have tool-input-available for client tool (emitted as CUSTOM event)
      const inputChunks = chunks.filter(
        (c: any) => c.type === 'CUSTOM' && c.name === 'tool-input-available',
      )
      expect(inputChunks.length).toBe(1)
    })
  })

  describe('Same Tool Called Multiple Times', () => {
    it('should handle the same tool called multiple times with different args', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'Checking multiple cities.',
            toolCalls: [
              { name: 'get_weather', arguments: { city: 'NYC' }, id: 'call-1' },
              { name: 'get_weather', arguments: { city: 'LA' }, id: 'call-2' },
              {
                name: 'get_weather',
                arguments: { city: 'Chicago' },
                id: 'call-3',
              },
            ],
          },
          {
            content: 'Here is the weather for all three cities.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const weatherExecute = vi.fn(async (args: { city: string }) => {
        const temps: Record<string, number> = { NYC: 70, LA: 85, Chicago: 60 }
        return JSON.stringify({ city: args.city, temp: temps[args.city] || 0 })
      })

      const weatherTool = toolDefinition({
        name: 'get_weather',
        description: 'Get weather',
        inputSchema: z.object({ city: z.string() }),
      }).server(weatherExecute)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [
          { role: 'user', content: 'Weather in NYC, LA, and Chicago' },
        ],
        tools: [weatherTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Should be called 3 times
      expect(weatherExecute).toHaveBeenCalledTimes(3)
      expect(weatherExecute).toHaveBeenCalledWith({ city: 'NYC' })
      expect(weatherExecute).toHaveBeenCalledWith({ city: 'LA' })
      expect(weatherExecute).toHaveBeenCalledWith({ city: 'Chicago' })

      // Should have 3 tool results
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(3)
    })
  })

  describe('Tool Selection', () => {
    it('should only execute tools that are called', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'I only need tool B.',
            toolCalls: [{ name: 'tool_b', arguments: {} }],
          },
          {
            content: 'Done with B.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const executeA = vi.fn(async () => 'A')
      const executeB = vi.fn(async () => 'B')
      const executeC = vi.fn(async () => 'C')

      const toolA = toolDefinition({
        name: 'tool_a',
        description: 'Tool A',
        inputSchema: z.object({}),
      }).server(executeA)

      const toolB = toolDefinition({
        name: 'tool_b',
        description: 'Tool B',
        inputSchema: z.object({}),
      }).server(executeB)

      const toolC = toolDefinition({
        name: 'tool_c',
        description: 'Tool C',
        inputSchema: z.object({}),
      }).server(executeC)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Just use B' }],
        tools: [toolA, toolB, toolC],
        agentLoopStrategy: maxIterations(10),
      })

      await collectChunks(stream)

      // Only B should be executed
      expect(executeA).not.toHaveBeenCalled()
      expect(executeB).toHaveBeenCalledTimes(1)
      expect(executeC).not.toHaveBeenCalled()
    })
  })
})
