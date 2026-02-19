import { describe, expect, it, vi } from 'vitest'
import { chat, maxIterations, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { createLLMSimulator } from '../../llm-simulator'
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

describe('Error Handling Tests', () => {
  describe('Tool Execution Errors', () => {
    it('should handle tool that throws an error', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'Let me try that operation.',
            toolCalls: [{ name: 'failing_tool', arguments: { input: 'test' } }],
          },
          {
            content: 'I encountered an error.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const failingExecute = vi.fn(async () => {
        throw new Error('Tool execution failed: database connection error')
      })

      const failingTool = toolDefinition({
        name: 'failing_tool',
        description: 'A tool that fails',
        inputSchema: z.object({ input: z.string() }),
      }).server(failingExecute)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Run the failing tool' }],
        tools: [failingTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Tool should have been called
      expect(failingExecute).toHaveBeenCalledTimes(1)

      // Should have a tool result with error
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(1)

      const result = JSON.parse((toolResultChunks[0] as any).result)
      expect(result.error).toContain('database connection error')
    })

    it('should handle async rejection in tool', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            toolCalls: [{ name: 'async_fail', arguments: {} }],
          },
          {
            content: 'Error handled.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const asyncFailExecute = vi.fn(async () => {
        return Promise.reject(new Error('Async rejection'))
      })

      const tool = toolDefinition({
        name: 'async_fail',
        description: 'Async failing tool',
        inputSchema: z.object({}),
      }).server(asyncFailExecute)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [tool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(1)

      const result = JSON.parse((toolResultChunks[0] as any).result)
      expect(result.error).toContain('Async rejection')
    })
  })

  describe('Unknown Tool', () => {
    it('should handle call to unknown tool gracefully', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'Using the tool.',
            toolCalls: [{ name: 'unknown_tool', arguments: { x: 1 } }],
          },
          {
            content: 'Done.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      // Only register a different tool
      const knownTool = toolDefinition({
        name: 'known_tool',
        description: 'A known tool',
        inputSchema: z.object({}),
      }).server(async () => 'result')

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [knownTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Should have a tool result with error about unknown tool
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(1)

      const result = JSON.parse((toolResultChunks[0] as any).result)
      expect(result.error).toContain('Unknown tool')
    })
  })

  describe('Tool With No Execute', () => {
    it('should emit tool-input-available for tool definition without execute', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            toolCalls: [
              { name: 'no_execute_tool', arguments: { data: 'test' } },
            ],
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      // Tool definition only (no .server() or .client() with execute)
      const toolDef = toolDefinition({
        name: 'no_execute_tool',
        description: 'Tool without execute',
        inputSchema: z.object({ data: z.string() }),
      })

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [toolDef],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Should emit tool-input-available since there's no execute (emitted as CUSTOM event)
      const inputChunks = chunks.filter(
        (c: any) => c.type === 'CUSTOM' && c.name === 'tool-input-available',
      )
      expect(inputChunks.length).toBe(1)
    })
  })

  describe('Empty Tool Calls', () => {
    it('should handle iteration with no tool calls gracefully', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'I will just respond without tools.',
            // No toolCalls
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const tool = toolDefinition({
        name: 'unused_tool',
        description: 'Tool',
        inputSchema: z.object({}),
      }).server(vi.fn())

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [tool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Should have content but no tool calls or results
      const contentChunks = chunks.filter(
        (c) => c.type === 'TEXT_MESSAGE_CONTENT',
      )
      const toolCallChunks = chunks.filter((c) => c.type === 'TOOL_CALL_START')
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')

      expect(contentChunks.length).toBeGreaterThan(0)
      expect(toolCallChunks.length).toBe(0)
      expect(toolResultChunks.length).toBe(0)
    })
  })

  describe('Max Iterations', () => {
    it('should stop after max iterations are reached', async () => {
      // Script that would loop forever
      const script: SimulatorScript = {
        iterations: [
          { toolCalls: [{ name: 'loop_tool', arguments: {} }] },
          { toolCalls: [{ name: 'loop_tool', arguments: {} }] },
          { toolCalls: [{ name: 'loop_tool', arguments: {} }] },
          { toolCalls: [{ name: 'loop_tool', arguments: {} }] },
          { toolCalls: [{ name: 'loop_tool', arguments: {} }] },
          { toolCalls: [{ name: 'loop_tool', arguments: {} }] },
          { toolCalls: [{ name: 'loop_tool', arguments: {} }] },
          { toolCalls: [{ name: 'loop_tool', arguments: {} }] },
          { toolCalls: [{ name: 'loop_tool', arguments: {} }] },
          { toolCalls: [{ name: 'loop_tool', arguments: {} }] },
        ],
      }
      const adapter = createLLMSimulator(script)

      const execute = vi.fn(async () => 'continue')

      const tool = toolDefinition({
        name: 'loop_tool',
        description: 'Looping tool',
        inputSchema: z.object({}),
      }).server(execute)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'loop' }],
        tools: [tool],
        agentLoopStrategy: maxIterations(3), // Limit to 3 iterations
      })

      const chunks = await collectChunks(stream)

      // Should stop at max iterations
      expect(execute.mock.calls.length).toBeLessThanOrEqual(3)

      // Should have RUN_FINISHED chunks
      const finishedChunks = chunks.filter((c) => c.type === 'RUN_FINISHED')
      expect(finishedChunks.length).toBeGreaterThan(0)
    })
  })

  describe('Tool Returns Non-String', () => {
    it('should handle tool returning object (auto-stringify)', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            toolCalls: [{ name: 'object_tool', arguments: {} }],
          },
          {
            content: 'Got the object.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const tool = toolDefinition({
        name: 'object_tool',
        description: 'Returns object',
        inputSchema: z.object({}),
      }).server(async () => {
        // Return object directly (should be stringified)
        return { key: 'value', nested: { a: 1 } }
      })

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [tool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(1)

      // Should be valid JSON
      const result = (toolResultChunks[0] as any).result
      const parsed = JSON.parse(result)
      expect(parsed.key).toBe('value')
      expect(parsed.nested.a).toBe(1)
    })

    it('should handle tool returning number', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            toolCalls: [{ name: 'number_tool', arguments: {} }],
          },
          {
            content: 'Got the number.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const tool = toolDefinition({
        name: 'number_tool',
        description: 'Returns number',
        inputSchema: z.object({}),
      }).server(async () => 42)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'test' }],
        tools: [tool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(1)

      // Number should be stringified
      const result = (toolResultChunks[0] as any).result
      expect(result).toBe('42')
    })
  })
})
