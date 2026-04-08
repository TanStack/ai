import { describe, expect, it, vi } from 'vitest'
import {
  ToolCallManager,
  executeToolCalls,
} from '../src/activities/chat/tools/tool-calls'
import type { Tool, ToolCall } from '../src/types'

/**
 * Drain an async generator and return its final return value.
 */
async function drainGenerator<TChunk, TResult>(
  gen: AsyncGenerator<TChunk, TResult, void>,
): Promise<TResult> {
  while (true) {
    const next = await gen.next()
    if (next.done) return next.value
  }
}

describe('null tool input normalization', () => {
  describe('executeToolCalls', () => {
    it('should normalize "null" arguments to empty object', async () => {
      const receivedInput = vi.fn()

      const tool: Tool = {
        name: 'test_tool',
        description: 'test',
        execute: async (input: unknown) => {
          receivedInput(input)
          return { ok: true }
        },
      }

      const toolCalls: Array<ToolCall> = [
        {
          id: 'tc-1',
          type: 'function',
          function: { name: 'test_tool', arguments: 'null' },
        },
      ]

      const result = await drainGenerator(executeToolCalls(toolCalls, [tool]))
      expect(receivedInput).toHaveBeenCalledWith({})
      expect(result.results).toHaveLength(1)
      expect(result.results[0]!.state).toBeUndefined()
    })

    it('should normalize empty arguments to empty object', async () => {
      const receivedInput = vi.fn()

      const tool: Tool = {
        name: 'test_tool',
        description: 'test',
        execute: async (input: unknown) => {
          receivedInput(input)
          return { ok: true }
        },
      }

      const toolCalls: Array<ToolCall> = [
        {
          id: 'tc-1',
          type: 'function',
          function: { name: 'test_tool', arguments: '' },
        },
      ]

      await drainGenerator(executeToolCalls(toolCalls, [tool]))
      expect(receivedInput).toHaveBeenCalledWith({})
    })

    it('should pass through valid object arguments unchanged', async () => {
      const receivedInput = vi.fn()

      const tool: Tool = {
        name: 'test_tool',
        description: 'test',
        execute: async (input: unknown) => {
          receivedInput(input)
          return { ok: true }
        },
      }

      const toolCalls: Array<ToolCall> = [
        {
          id: 'tc-1',
          type: 'function',
          function: {
            name: 'test_tool',
            arguments: '{"location":"NYC"}',
          },
        },
      ]

      await drainGenerator(executeToolCalls(toolCalls, [tool]))
      expect(receivedInput).toHaveBeenCalledWith({ location: 'NYC' })
    })
  })

  describe('ToolCallManager.completeToolCall', () => {
    it('should normalize null input to empty object', () => {
      const manager = new ToolCallManager([])

      // Register a tool call
      manager.addToolCallStartEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolName: 'test_tool',
        model: 'test',
        timestamp: Date.now(),
        index: 0,
      })

      // Complete with null input (simulating Anthropic empty tool_use)
      manager.completeToolCall({
        type: 'TOOL_CALL_END',
        toolCallId: 'tc-1',
        toolName: 'test_tool',
        model: 'test',
        timestamp: Date.now(),
        input: null as unknown,
      })

      const toolCalls = manager.getToolCalls()
      expect(toolCalls).toHaveLength(1)
      // Should be "{}" not "null"
      expect(toolCalls[0]!.function.arguments).toBe('{}')
    })

    it('should preserve valid object input', () => {
      const manager = new ToolCallManager([])

      manager.addToolCallStartEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolName: 'test_tool',
        model: 'test',
        timestamp: Date.now(),
        index: 0,
      })

      manager.completeToolCall({
        type: 'TOOL_CALL_END',
        toolCallId: 'tc-1',
        toolName: 'test_tool',
        model: 'test',
        timestamp: Date.now(),
        input: { location: 'NYC' },
      })

      const toolCalls = manager.getToolCalls()
      expect(toolCalls[0]!.function.arguments).toBe('{"location":"NYC"}')
    })
  })
})
