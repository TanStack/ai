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

describe('Server Tool Tests', () => {
  describe('Single Server Tool Execution', () => {
    it('should execute a server tool and return the result', async () => {
      const script = SimulatorScripts.singleServerTool(
        'get_temperature',
        { location: 'San Francisco' },
        'The temperature in San Francisco is 70 degrees.',
      )
      const adapter = createLLMSimulator(script)

      const executeFn = vi.fn(async (args: { location: string }) => {
        return `${args.location}: 70°F`
      })

      const temperatureTool = toolDefinition({
        name: 'get_temperature',
        description: 'Get the current temperature for a location',
        inputSchema: z.object({
          location: z.string().describe('The city name'),
        }),
      }).server(executeFn)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [
          {
            role: 'user',
            content: 'What is the temperature in San Francisco?',
          },
        ],
        tools: [temperatureTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Verify the tool was called
      expect(executeFn).toHaveBeenCalledTimes(1)
      expect(executeFn).toHaveBeenCalledWith({ location: 'San Francisco' })

      // Verify we got tool call and tool result chunks
      const toolCallChunks = chunks.filter((c) => c.type === 'TOOL_CALL_START')
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')

      expect(toolCallChunks.length).toBeGreaterThan(0)
      expect(toolResultChunks.length).toBe(1)

      // Verify the tool result content
      const resultChunk = toolResultChunks[0] as any
      expect(resultChunk.result).toContain('San Francisco')
      expect(resultChunk.result).toContain('70')
    })

    it('should handle a tool with complex nested arguments', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'Let me search for that.',
            toolCalls: [
              {
                name: 'search_products',
                arguments: {
                  query: 'laptop',
                  filters: {
                    minPrice: 500,
                    maxPrice: 2000,
                    brands: ['Apple', 'Dell'],
                  },
                  limit: 10,
                },
              },
            ],
          },
          {
            content: 'I found 5 laptops matching your criteria.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const executeFn = vi.fn(async (args: any) => {
        return JSON.stringify({
          products: [{ name: 'MacBook Pro', price: 1999 }],
          total: 5,
        })
      })

      const searchTool = toolDefinition({
        name: 'search_products',
        description: 'Search for products',
        inputSchema: z.object({
          query: z.string(),
          filters: z.object({
            minPrice: z.number(),
            maxPrice: z.number(),
            brands: z.array(z.string()),
          }),
          limit: z.number(),
        }),
      }).server(executeFn)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Find me a laptop' }],
        tools: [searchTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      expect(executeFn).toHaveBeenCalledTimes(1)
      expect(executeFn).toHaveBeenCalledWith({
        query: 'laptop',
        filters: {
          minPrice: 500,
          maxPrice: 2000,
          brands: ['Apple', 'Dell'],
        },
        limit: 10,
      })

      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(1)
    })

    it('should handle a tool that returns JSON', async () => {
      const script = SimulatorScripts.singleServerTool(
        'get_user',
        { userId: '123' },
        'Here is the user information.',
      )
      const adapter = createLLMSimulator(script)

      // Return an object (will be JSON.stringified by the framework)
      const executeFn = vi.fn(async (args: { userId: string }) => {
        return {
          id: args.userId,
          name: 'John Doe',
          email: 'john@example.com',
        }
      })

      const getUserTool = toolDefinition({
        name: 'get_user',
        description: 'Get user by ID',
        inputSchema: z.object({
          userId: z.string(),
        }),
        outputSchema: z.object({
          id: z.string(),
          name: z.string(),
          email: z.string(),
        }),
      }).server(executeFn)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Get user 123' }],
        tools: [getUserTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')

      expect(toolResultChunks.length).toBe(1)
      // The result is the JSON-stringified tool output
      const result = (toolResultChunks[0] as any).result
      expect(result).toContain('123')
      expect(result).toContain('John Doe')
    })

    it('should handle tool that returns an object result', async () => {
      const script = SimulatorScripts.singleServerTool(
        'echo',
        { message: 'Hello' },
        'Echo complete.',
      )
      const adapter = createLLMSimulator(script)

      // Return an object (framework handles stringification)
      const executeFn = vi.fn(async (args: { message: string }) => {
        return { echoed: args.message.toUpperCase() }
      })

      const echoTool = toolDefinition({
        name: 'echo',
        description: 'Echo a message',
        inputSchema: z.object({ message: z.string() }),
      }).server(executeFn)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Echo hello' }],
        tools: [echoTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')

      expect(executeFn).toHaveBeenCalledWith({ message: 'Hello' })
      expect(toolResultChunks.length).toBe(1)
      expect((toolResultChunks[0] as any).result).toContain('HELLO')
    })
  })

  describe('Tool Execution Tracking', () => {
    it('should track tool call ID correctly', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            toolCalls: [
              { name: 'test_tool', arguments: {}, id: 'custom-call-id-123' },
            ],
          },
          { content: 'Done' },
        ],
      }
      const adapter = createLLMSimulator(script)

      const executeFn = vi.fn(async () => 'result')

      const tool = toolDefinition({
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: z.object({}),
      }).server(executeFn)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [tool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)
      const toolCallChunks = chunks.filter((c) => c.type === 'TOOL_CALL_START')
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')

      expect(toolCallChunks.length).toBeGreaterThan(0)
      expect((toolCallChunks[0] as any).toolCallId).toBe('custom-call-id-123')
      expect((toolResultChunks[0] as any).toolCallId).toBe('custom-call-id-123')
    })

    it('should generate tool call ID if not provided', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            toolCalls: [{ name: 'test_tool', arguments: {} }],
          },
          { content: 'Done' },
        ],
      }
      const adapter = createLLMSimulator(script)

      const tool = toolDefinition({
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: z.object({}),
      }).server(async () => 'result')

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [tool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)
      const toolCallChunks = chunks.filter((c) => c.type === 'TOOL_CALL_START')

      expect(toolCallChunks.length).toBeGreaterThan(0)
      expect((toolCallChunks[0] as any).toolCallId).toMatch(/^call-\d+-\d+$/)
    })
  })

  describe('Content and Tool Call Together', () => {
    it('should handle content followed by tool call in same iteration', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'Let me check that for you.',
            toolCalls: [
              { name: 'check_status', arguments: { id: 'order-123' } },
            ],
          },
          { content: 'Your order is on its way!' },
        ],
      }
      const adapter = createLLMSimulator(script)

      const executeFn = vi.fn(async () => JSON.stringify({ status: 'shipped' }))

      const tool = toolDefinition({
        name: 'check_status',
        description: 'Check order status',
        inputSchema: z.object({ id: z.string() }),
      }).server(executeFn)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Check my order' }],
        tools: [tool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      const contentChunks = chunks.filter(
        (c) => c.type === 'TEXT_MESSAGE_CONTENT',
      )
      const toolCallChunks = chunks.filter((c) => c.type === 'TOOL_CALL_START')

      // Should have content chunks from both iterations
      expect(contentChunks.length).toBeGreaterThan(0)
      expect(toolCallChunks.length).toBeGreaterThan(0)
      expect(executeFn).toHaveBeenCalledWith({ id: 'order-123' })
    })
  })
})
