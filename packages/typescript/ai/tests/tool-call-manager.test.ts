import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ToolCallManager } from '../src/activities/chat/tools/tool-calls'
import type { DoneStreamChunk, Tool } from '../src/types'

describe('ToolCallManager', () => {
  const mockDoneChunk: DoneStreamChunk = {
    type: 'done',
    id: 'test-id',
    model: 'gpt-4',
    timestamp: Date.now(),
    finishReason: 'tool_calls',
  }

  const mockWeatherTool: Tool = {
    name: 'get_weather',
    description: 'Get weather',
    inputSchema: z.object({
      location: z.string().optional(),
    }),
    execute: vi.fn((args: any) => {
      return JSON.stringify({ temp: 72, location: args.location })
    }),
  }

  async function collectGeneratorOutput<TChunk, TResult>(
    generator: AsyncGenerator<TChunk, TResult, void>,
  ): Promise<{
    chunks: Array<TChunk>
    result: TResult
  }> {
    const chunks: Array<TChunk> = []
    let next = await generator.next()
    while (!next.done) {
      chunks.push(next.value)
      next = await generator.next()
    }
    return { chunks, result: next.value }
  }

  it('should accumulate tool call chunks', () => {
    const manager = new ToolCallManager([mockWeatherTool])

    manager.addToolCallChunk({
      toolCall: {
        id: 'call_123',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"loc' },
      },
      index: 0,
    })

    manager.addToolCallChunk({
      toolCall: {
        id: 'call_123',
        type: 'function',
        function: { name: '', arguments: 'ation":"Paris"}' },
      },
      index: 0,
    })

    const toolCalls = manager.getToolCalls()
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]?.id).toBe('call_123')
    expect(toolCalls[0]?.function.name).toBe('get_weather')
    expect(toolCalls[0]?.function.arguments).toBe('{"location":"Paris"}')
  })

  it('should filter out incomplete tool calls', () => {
    const manager = new ToolCallManager([mockWeatherTool])

    // Add complete tool call
    manager.addToolCallChunk({
      toolCall: {
        id: 'call_123',
        type: 'function',
        function: { name: 'get_weather', arguments: '{}' },
      },
      index: 0,
    })

    // Add incomplete tool call (no name)
    manager.addToolCallChunk({
      toolCall: {
        id: 'call_456',
        type: 'function',
        function: { name: '', arguments: '{}' },
      },
      index: 1,
    })

    const toolCalls = manager.getToolCalls()
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]?.id).toBe('call_123')
  })

  it('should execute tools and emit tool_result chunks', async () => {
    const manager = new ToolCallManager([mockWeatherTool])

    manager.addToolCallChunk({
      toolCall: {
        id: 'call_123',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"location":"Paris"}' },
      },
      index: 0,
    })

    const { chunks: emittedChunks, result: finalResult } =
      await collectGeneratorOutput(manager.executeTools(mockDoneChunk))

    // Should emit one tool_result chunk
    expect(emittedChunks).toHaveLength(1)
    expect(emittedChunks[0]?.type).toBe('tool_result')
    expect(emittedChunks[0]?.toolCallId).toBe('call_123')
    // Use type guard for union type
    const chunk = emittedChunks[0]
    if (chunk?.type === 'tool_result') {
      expect(chunk.content).toContain('temp')
    }

    // Should return one tool result message
    expect(finalResult).toHaveLength(1)
    expect(finalResult[0]?.role).toBe('tool')
    expect(finalResult[0]?.toolCallId).toBe('call_123')

    // Tool execute should have been called
    expect(mockWeatherTool.execute).toHaveBeenCalledWith({ location: 'Paris' })
  })

  it('should handle tool execution errors gracefully', async () => {
    const errorTool: Tool = {
      name: 'error_tool',
      description: 'Throws error',
      inputSchema: z.object({}),
      execute: vi.fn(() => {
        throw new Error('Tool failed')
      }),
    }

    const manager = new ToolCallManager([errorTool])

    manager.addToolCallChunk({
      toolCall: {
        id: 'call_123',
        type: 'function',
        function: { name: 'error_tool', arguments: '{}' },
      },
      index: 0,
    })

    // Properly consume the generator
    const { chunks, result: toolResults } = await collectGeneratorOutput(
      manager.executeTools(mockDoneChunk),
    )

    // Should still emit chunk with error message
    expect(chunks).toHaveLength(1)
    // Use type guard for union type
    const chunk = chunks[0]
    if (chunk?.type === 'tool_result') {
      expect(chunk.content).toContain('Error executing tool: Tool failed')
    }

    // Should still return tool result message
    expect(toolResults).toHaveLength(1)
    expect(toolResults[0]?.content).toContain('Error executing tool')
  })

  it('should handle tools without execute function', async () => {
    const noExecuteTool: Tool = {
      name: 'no_execute',
      description: 'No execute function',
      inputSchema: z.object({}),
      // No execute function
    }

    const manager = new ToolCallManager([noExecuteTool])

    manager.addToolCallChunk({
      toolCall: {
        id: 'call_123',
        type: 'function',
        function: { name: 'no_execute', arguments: '{}' },
      },
      index: 0,
    })

    const { chunks, result: toolResults } = await collectGeneratorOutput(
      manager.executeTools(mockDoneChunk),
    )

    // Use type guard for union type
    const chunk = chunks[0]
    if (chunk?.type === 'tool_result') {
      expect(chunk.content).toContain('does not have an execute function')
    }
    expect(toolResults[0]?.content).toContain(
      'does not have an execute function',
    )
  })

  it('should clear tool calls', () => {
    const manager = new ToolCallManager([mockWeatherTool])

    manager.addToolCallChunk({
      toolCall: {
        id: 'call_123',
        type: 'function',
        function: { name: 'get_weather', arguments: '{}' },
      },
      index: 0,
    })

    expect(manager.hasToolCalls()).toBe(true)

    manager.clear()

    expect(manager.hasToolCalls()).toBe(false)
    expect(manager.getToolCalls()).toHaveLength(0)
  })

  it('should handle multiple tool calls in same iteration', async () => {
    const calculateTool: Tool = {
      name: 'calculate',
      description: 'Calculate',
      inputSchema: z.object({
        expression: z.string(),
      }),
      execute: vi.fn((args: any) => {
        return JSON.stringify({ result: eval(args.expression) })
      }),
    }

    const manager = new ToolCallManager([mockWeatherTool, calculateTool])

    // Add two different tool calls
    manager.addToolCallChunk({
      toolCall: {
        id: 'call_weather',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"location":"Paris"}' },
      },
      index: 0,
    })

    manager.addToolCallChunk({
      toolCall: {
        id: 'call_calc',
        type: 'function',
        function: { name: 'calculate', arguments: '{"expression":"5+3"}' },
      },
      index: 1,
    })

    const toolCalls = manager.getToolCalls()
    expect(toolCalls).toHaveLength(2)

    const { chunks, result: toolResults } = await collectGeneratorOutput(
      manager.executeTools(mockDoneChunk),
    )

    // Should emit two tool_result chunks
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.toolCallId).toBe('call_weather')
    expect(chunks[1]?.toolCallId).toBe('call_calc')

    // Should return two tool result messages
    expect(toolResults).toHaveLength(2)
    expect(toolResults[0]?.toolCallId).toBe('call_weather')
    expect(toolResults[1]?.toolCallId).toBe('call_calc')
  })

  // ===========================
  // AG-UI Event Method Tests
  // ===========================

  describe('AG-UI Event Methods', () => {
    it('should handle TOOL_CALL_START events', () => {
      const manager = new ToolCallManager([mockWeatherTool])

      manager.addToolCallStartEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'call_123',
        toolName: 'get_weather',
        timestamp: Date.now(),
        index: 0,
      })

      const toolCalls = manager.getToolCalls()
      expect(toolCalls).toHaveLength(1)
      expect(toolCalls[0]?.id).toBe('call_123')
      expect(toolCalls[0]?.function.name).toBe('get_weather')
      expect(toolCalls[0]?.function.arguments).toBe('')
    })

    it('should accumulate TOOL_CALL_ARGS events', () => {
      const manager = new ToolCallManager([mockWeatherTool])

      manager.addToolCallStartEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'call_123',
        toolName: 'get_weather',
        timestamp: Date.now(),
        index: 0,
      })

      manager.addToolCallArgsEvent({
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'call_123',
        timestamp: Date.now(),
        delta: '{"loc',
      })

      manager.addToolCallArgsEvent({
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'call_123',
        timestamp: Date.now(),
        delta: 'ation":"Paris"}',
      })

      const toolCalls = manager.getToolCalls()
      expect(toolCalls).toHaveLength(1)
      expect(toolCalls[0]?.function.arguments).toBe('{"location":"Paris"}')
    })

    it('should complete tool calls with TOOL_CALL_END events', () => {
      const manager = new ToolCallManager([mockWeatherTool])

      manager.addToolCallStartEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'call_123',
        toolName: 'get_weather',
        timestamp: Date.now(),
        index: 0,
      })

      manager.completeToolCall({
        type: 'TOOL_CALL_END',
        toolCallId: 'call_123',
        toolName: 'get_weather',
        timestamp: Date.now(),
        input: { location: 'New York' },
      })

      const toolCalls = manager.getToolCalls()
      expect(toolCalls).toHaveLength(1)
      expect(toolCalls[0]?.function.arguments).toBe('{"location":"New York"}')
    })

    it('should handle mixed AG-UI and legacy events', () => {
      const manager = new ToolCallManager([mockWeatherTool])

      // Start with AG-UI event
      manager.addToolCallStartEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'call_agui',
        toolName: 'get_weather',
        timestamp: Date.now(),
        index: 0,
      })

      // Add args via AG-UI
      manager.addToolCallArgsEvent({
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'call_agui',
        timestamp: Date.now(),
        delta: '{"location":"Tokyo"}',
      })

      // Add another tool via legacy method
      manager.addToolCallChunk({
        toolCall: {
          id: 'call_legacy',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"location":"London"}' },
        },
        index: 1,
      })

      const toolCalls = manager.getToolCalls()
      expect(toolCalls).toHaveLength(2)
      expect(toolCalls[0]?.id).toBe('call_agui')
      expect(toolCalls[1]?.id).toBe('call_legacy')
    })
  })
})
