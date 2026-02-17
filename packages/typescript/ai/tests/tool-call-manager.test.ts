import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  ToolCallManager,
  executeToolCalls,
} from '../src/activities/chat/tools/tool-calls'
import type { RunFinishedEvent, Tool, ToolCall } from '../src/types'

describe('ToolCallManager', () => {
  const mockFinishedEvent: RunFinishedEvent = {
    type: 'RUN_FINISHED',
    runId: 'test-run-id',
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

  it('should accumulate tool call events', () => {
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
    expect(toolCalls[0]?.id).toBe('call_123')
    expect(toolCalls[0]?.function.name).toBe('get_weather')
    expect(toolCalls[0]?.function.arguments).toBe('{"location":"Paris"}')
  })

  it('should filter out incomplete tool calls', () => {
    const manager = new ToolCallManager([mockWeatherTool])

    // Add complete tool call
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
      delta: '{}',
    })

    // Add incomplete tool call (no name - empty toolName)
    manager.addToolCallStartEvent({
      type: 'TOOL_CALL_START',
      toolCallId: 'call_456',
      toolName: '',
      timestamp: Date.now(),
      index: 1,
    })

    const toolCalls = manager.getToolCalls()
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]?.id).toBe('call_123')
  })

  it('should execute tools and emit TOOL_CALL_END events', async () => {
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
      delta: '{"location":"Paris"}',
    })

    const { chunks: emittedChunks, result: finalResult } =
      await collectGeneratorOutput(manager.executeTools(mockFinishedEvent))

    // Should emit one TOOL_CALL_END event
    expect(emittedChunks).toHaveLength(1)
    expect(emittedChunks[0]?.type).toBe('TOOL_CALL_END')
    expect(emittedChunks[0]?.toolCallId).toBe('call_123')
    expect(emittedChunks[0]?.result).toContain('temp')

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

    manager.addToolCallStartEvent({
      type: 'TOOL_CALL_START',
      toolCallId: 'call_123',
      toolName: 'error_tool',
      timestamp: Date.now(),
      index: 0,
    })

    manager.addToolCallArgsEvent({
      type: 'TOOL_CALL_ARGS',
      toolCallId: 'call_123',
      timestamp: Date.now(),
      delta: '{}',
    })

    // Properly consume the generator
    const { chunks, result: toolResults } = await collectGeneratorOutput(
      manager.executeTools(mockFinishedEvent),
    )

    // Should still emit chunk with error message
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.type).toBe('TOOL_CALL_END')
    expect(chunks[0]?.result).toContain('Error executing tool: Tool failed')

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

    manager.addToolCallStartEvent({
      type: 'TOOL_CALL_START',
      toolCallId: 'call_123',
      toolName: 'no_execute',
      timestamp: Date.now(),
      index: 0,
    })

    manager.addToolCallArgsEvent({
      type: 'TOOL_CALL_ARGS',
      toolCallId: 'call_123',
      timestamp: Date.now(),
      delta: '{}',
    })

    const { chunks, result: toolResults } = await collectGeneratorOutput(
      manager.executeTools(mockFinishedEvent),
    )

    expect(chunks[0]?.type).toBe('TOOL_CALL_END')
    expect(chunks[0]?.result).toContain('does not have an execute function')
    expect(toolResults[0]?.content).toContain(
      'does not have an execute function',
    )
  })

  it('should clear tool calls', () => {
    const manager = new ToolCallManager([mockWeatherTool])

    manager.addToolCallStartEvent({
      type: 'TOOL_CALL_START',
      toolCallId: 'call_123',
      toolName: 'get_weather',
      timestamp: Date.now(),
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
    manager.addToolCallStartEvent({
      type: 'TOOL_CALL_START',
      toolCallId: 'call_weather',
      toolName: 'get_weather',
      timestamp: Date.now(),
      index: 0,
    })

    manager.addToolCallArgsEvent({
      type: 'TOOL_CALL_ARGS',
      toolCallId: 'call_weather',
      timestamp: Date.now(),
      delta: '{"location":"Paris"}',
    })

    manager.addToolCallStartEvent({
      type: 'TOOL_CALL_START',
      toolCallId: 'call_calc',
      toolName: 'calculate',
      timestamp: Date.now(),
      index: 1,
    })

    manager.addToolCallArgsEvent({
      type: 'TOOL_CALL_ARGS',
      toolCallId: 'call_calc',
      timestamp: Date.now(),
      delta: '{"expression":"5+3"}',
    })

    const toolCalls = manager.getToolCalls()
    expect(toolCalls).toHaveLength(2)

    const { chunks, result: toolResults } = await collectGeneratorOutput(
      manager.executeTools(mockFinishedEvent),
    )

    // Should emit two TOOL_CALL_END events
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.toolCallId).toBe('call_weather')
    expect(chunks[1]?.toolCallId).toBe('call_calc')

    // Should return two tool result messages
    expect(toolResults).toHaveLength(2)
    expect(toolResults[0]?.toolCallId).toBe('call_weather')
    expect(toolResults[1]?.toolCallId).toBe('call_calc')
  })

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
  })
})

describe('executeToolCalls', () => {
  // Client tool (no execute function) with needsApproval
  const clientToolWithApproval: Tool = {
    name: 'delete_local_data',
    description: 'Delete data from local storage',
    inputSchema: z.object({ key: z.string() }),
    needsApproval: true,
    // No execute = client tool
  }

  // Client tool (no execute function) without approval
  const clientToolWithoutApproval: Tool = {
    name: 'get_local_data',
    description: 'Get data from local storage',
    inputSchema: z.object({ key: z.string() }),
    // No execute = client tool, no needsApproval
  }

  // Server tool with approval
  const serverToolWithApproval: Tool = {
    name: 'delete_record',
    description: 'Delete a record',
    inputSchema: z.object({ id: z.string() }),
    needsApproval: true,
    execute: vi.fn(() => ({ deleted: true })),
  }

  function makeToolCall(
    id: string,
    name: string,
    args: string = '{}',
  ): ToolCall {
    return {
      id,
      type: 'function',
      function: { name, arguments: args },
    }
  }

  describe('client tool with needsApproval', () => {
    it('should request approval when no approval decision exists', async () => {
      const toolCalls = [
        makeToolCall('call_1', 'delete_local_data', '{"key":"myKey"}'),
      ]

      const result = await executeToolCalls(
        toolCalls,
        [clientToolWithApproval],
        new Map(),
        new Map(),
      )

      expect(result.needsApproval).toHaveLength(1)
      expect(result.needsApproval[0]?.toolCallId).toBe('call_1')
      expect(result.needsApproval[0]?.approvalId).toBe('approval_call_1')
      expect(result.results).toHaveLength(0)
      expect(result.needsClientExecution).toHaveLength(0)
    })

    it('should request client execution after approval when no client result exists', async () => {
      const toolCalls = [
        makeToolCall('call_1', 'delete_local_data', '{"key":"myKey"}'),
      ]
      const approvals = new Map([['approval_call_1', true]])

      const result = await executeToolCalls(
        toolCalls,
        [clientToolWithApproval],
        approvals,
        new Map(), // No client results yet
      )

      // Should request client execution, NOT produce a result
      expect(result.needsClientExecution).toHaveLength(1)
      expect(result.needsClientExecution[0]?.toolCallId).toBe('call_1')
      expect(result.needsClientExecution[0]?.toolName).toBe('delete_local_data')
      expect(result.results).toHaveLength(0)
      expect(result.needsApproval).toHaveLength(0)
    })

    it('should return result when client has executed after approval', async () => {
      const toolCalls = [
        makeToolCall('call_1', 'delete_local_data', '{"key":"myKey"}'),
      ]
      const approvals = new Map([['approval_call_1', true]])
      const clientResults = new Map([['call_1', { deleted: true }]])

      const result = await executeToolCalls(
        toolCalls,
        [clientToolWithApproval],
        approvals,
        clientResults,
      )

      expect(result.results).toHaveLength(1)
      expect(result.results[0]?.toolCallId).toBe('call_1')
      expect(result.results[0]?.result).toEqual({ deleted: true })
      expect(result.needsClientExecution).toHaveLength(0)
      expect(result.needsApproval).toHaveLength(0)
    })

    it('should return error when user declines approval', async () => {
      const toolCalls = [
        makeToolCall('call_1', 'delete_local_data', '{"key":"myKey"}'),
      ]
      const approvals = new Map([['approval_call_1', false]])

      const result = await executeToolCalls(
        toolCalls,
        [clientToolWithApproval],
        approvals,
        new Map(),
      )

      expect(result.results).toHaveLength(1)
      expect(result.results[0]?.result).toEqual({
        error: 'User declined tool execution',
      })
      expect(result.results[0]?.state).toBe('output-error')
      expect(result.needsClientExecution).toHaveLength(0)
      expect(result.needsApproval).toHaveLength(0)
    })

    it('should treat approval response object as a real result if leaked into clientResults (bug scenario)', async () => {
      // This test documents the behavior when collectClientState does NOT
      // filter out approval response messages. If the pendingExecution marker
      // leaks through as a client result, executeToolCalls will incorrectly
      // treat it as the tool's real output. The fix is in collectClientState
      // which filters these out before they reach executeToolCalls.
      const toolCalls = [
        makeToolCall('call_1', 'delete_local_data', '{"key":"myKey"}'),
      ]
      const approvals = new Map([['approval_call_1', true]])
      // Simulating the bug: approval response leaked into clientResults
      const clientResults = new Map([
        [
          'call_1',
          {
            approved: true,
            pendingExecution: true,
            message: 'User approved this action',
          },
        ],
      ])

      const result = await executeToolCalls(
        toolCalls,
        [clientToolWithApproval],
        approvals,
        clientResults,
      )

      // With the bug, the bogus approval object becomes the "result"
      // instead of requesting client execution
      expect(result.results).toHaveLength(1)
      expect(result.results[0]?.result).toEqual({
        approved: true,
        pendingExecution: true,
        message: 'User approved this action',
      })
      expect(result.needsClientExecution).toHaveLength(0)
    })
  })

  describe('client tool without approval', () => {
    it('should request client execution when no result exists', async () => {
      const toolCalls = [
        makeToolCall('call_1', 'get_local_data', '{"key":"myKey"}'),
      ]

      const result = await executeToolCalls(
        toolCalls,
        [clientToolWithoutApproval],
        new Map(),
        new Map(),
      )

      expect(result.needsClientExecution).toHaveLength(1)
      expect(result.needsClientExecution[0]?.toolCallId).toBe('call_1')
      expect(result.results).toHaveLength(0)
    })

    it('should return result when client has executed', async () => {
      const toolCalls = [
        makeToolCall('call_1', 'get_local_data', '{"key":"myKey"}'),
      ]
      const clientResults = new Map([['call_1', { value: 'stored_data' }]])

      const result = await executeToolCalls(
        toolCalls,
        [clientToolWithoutApproval],
        new Map(),
        clientResults,
      )

      expect(result.results).toHaveLength(1)
      expect(result.results[0]?.result).toEqual({ value: 'stored_data' })
      expect(result.needsClientExecution).toHaveLength(0)
    })
  })

  describe('server tool with approval', () => {
    it('should request approval when no decision exists', async () => {
      const toolCalls = [
        makeToolCall('call_1', 'delete_record', '{"id":"rec_123"}'),
      ]

      const result = await executeToolCalls(
        toolCalls,
        [serverToolWithApproval],
        new Map(),
        new Map(),
      )

      expect(result.needsApproval).toHaveLength(1)
      expect(result.needsApproval[0]?.approvalId).toBe('approval_call_1')
      expect(result.results).toHaveLength(0)
    })

    it('should execute server tool after approval', async () => {
      const toolCalls = [
        makeToolCall('call_1', 'delete_record', '{"id":"rec_123"}'),
      ]
      const approvals = new Map([['approval_call_1', true]])

      const result = await executeToolCalls(
        toolCalls,
        [serverToolWithApproval],
        approvals,
        new Map(),
      )

      expect(result.results).toHaveLength(1)
      expect(result.results[0]?.result).toEqual({ deleted: true })
      expect(serverToolWithApproval.execute).toHaveBeenCalledWith({
        id: 'rec_123',
      })
    })
  })

  describe('argument normalization', () => {
    it('should normalize empty arguments to empty object', async () => {
      const tool: Tool = {
        name: 'simple_tool',
        description: 'A tool with no required args',
        inputSchema: z.object({}),
        execute: vi.fn(() => ({ done: true })),
      }

      const toolCalls = [makeToolCall('call_1', 'simple_tool', '')]

      const result = await executeToolCalls(
        toolCalls,
        [tool],
        new Map(),
        new Map(),
      )

      expect(result.results).toHaveLength(1)
      expect(tool.execute).toHaveBeenCalledWith({})
    })
  })
})
