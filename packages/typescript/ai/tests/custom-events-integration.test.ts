import { describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '../src/activities/chat/tools/tool-definition'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { z } from 'zod'

describe('Custom Events Integration', () => {
  it('should emit custom events from tool execution context', async () => {
    const onCustomEvent = vi.fn()

    // Create a test tool that emits custom events
    const testTool = toolDefinition({
      name: 'testTool',
      description: 'A test tool that emits custom events',
      inputSchema: z.object({
        message: z.string(),
      }),
    }).server(async (args, context) => {
      // Emit progress event
      context?.emitCustomEvent('tool:progress', {
        tool: 'testTool',
        progress: 25,
        message: 'Starting processing...',
      })

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Emit another progress event
      context?.emitCustomEvent('tool:progress', {
        tool: 'testTool',
        progress: 75,
        message: 'Almost done...',
      })

      // Emit completion event
      context?.emitCustomEvent('tool:complete', {
        tool: 'testTool',
        result: 'success',
        duration: 20,
      })

      return { processed: args.message }
    })

    const processor = new StreamProcessor({
      events: {
        onCustomEvent,
        onMessagesChange: vi.fn(),
        onStreamStart: vi.fn(),
        onStreamEnd: vi.fn(),
        onError: vi.fn(),
        onToolCall: vi.fn(),
        onApprovalRequest: vi.fn(),
        onTextUpdate: vi.fn(),
        onToolCallStateChange: vi.fn(),
        onThinkingUpdate: vi.fn(),
      },
    })

    // Prepare assistant message
    processor.prepareAssistantMessage()

    // Simulate tool call sequence
    processor.processChunk({
      type: 'TOOL_CALL_START',
      toolCallId: 'tc-1',
      toolName: 'testTool',
      timestamp: Date.now(),
      index: 0,
    })

    processor.processChunk({
      type: 'TOOL_CALL_ARGS',
      toolCallId: 'tc-1',
      timestamp: Date.now(),
      delta: '{"message": "Hello World"}',
    })

    processor.processChunk({
      type: 'TOOL_CALL_END',
      toolCallId: 'tc-1',
      toolName: 'testTool',
      timestamp: Date.now(),
      input: { message: 'Hello World' },
    })

    // Execute the tool manually (simulating what happens in real scenario)
    const toolExecuteFunc = (testTool as any).execute
    if (toolExecuteFunc) {
      const mockContext = {
        toolCallId: 'tc-1',
        emitCustomEvent: (eventName: string, data: any) => {
          // This simulates the real behavior where emitCustomEvent creates CUSTOM stream chunks
          processor.processChunk({
            type: 'CUSTOM',
            name: eventName,
            data: { ...data, toolCallId: 'tc-1' },
            timestamp: Date.now(),
          })
        },
      }

      await toolExecuteFunc({ message: 'Hello World' }, mockContext)
    }

    // Verify custom events were emitted
    expect(onCustomEvent).toHaveBeenCalledTimes(3)

    expect(onCustomEvent).toHaveBeenNthCalledWith(
      1,
      'tool:progress',
      {
        tool: 'testTool',
        progress: 25,
        message: 'Starting processing...',
        toolCallId: 'tc-1',
      },
      { toolCallId: 'tc-1' },
    )

    expect(onCustomEvent).toHaveBeenNthCalledWith(
      2,
      'tool:progress',
      {
        tool: 'testTool',
        progress: 75,
        message: 'Almost done...',
        toolCallId: 'tc-1',
      },
      { toolCallId: 'tc-1' },
    )

    expect(onCustomEvent).toHaveBeenNthCalledWith(
      3,
      'tool:complete',
      { tool: 'testTool', result: 'success', duration: 20, toolCallId: 'tc-1' },
      { toolCallId: 'tc-1' },
    )
  })

  it('should handle custom events without toolCallId in context', async () => {
    const onCustomEvent = vi.fn()

    const processor = new StreamProcessor({
      events: {
        onCustomEvent,
        onMessagesChange: vi.fn(),
        onStreamStart: vi.fn(),
        onStreamEnd: vi.fn(),
        onError: vi.fn(),
        onToolCall: vi.fn(),
        onApprovalRequest: vi.fn(),
        onTextUpdate: vi.fn(),
        onToolCallStateChange: vi.fn(),
        onThinkingUpdate: vi.fn(),
      },
    })

    // Emit custom event without toolCallId
    processor.processChunk({
      type: 'CUSTOM',
      name: 'system:status',
      data: { status: 'ready', version: '1.0.0' },
      timestamp: Date.now(),
    })

    expect(onCustomEvent).toHaveBeenCalledWith(
      'system:status',
      { status: 'ready', version: '1.0.0' },
      { toolCallId: undefined },
    )
  })

  it('should not forward system custom events to onCustomEvent callback', async () => {
    const onCustomEvent = vi.fn()
    const onToolCall = vi.fn()
    const onApprovalRequest = vi.fn()

    const processor = new StreamProcessor({
      events: {
        onCustomEvent,
        onToolCall,
        onApprovalRequest,
        onMessagesChange: vi.fn(),
        onStreamStart: vi.fn(),
        onStreamEnd: vi.fn(),
        onError: vi.fn(),
        onTextUpdate: vi.fn(),
        onToolCallStateChange: vi.fn(),
        onThinkingUpdate: vi.fn(),
      },
    })

    processor.prepareAssistantMessage()

    // System event: tool-input-available
    processor.processChunk({
      type: 'CUSTOM',
      name: 'tool-input-available',
      data: {
        toolCallId: 'tc-1',
        toolName: 'testTool',
        input: { test: true },
      },
      timestamp: Date.now(),
    })

    // System event: approval-requested
    processor.processChunk({
      type: 'CUSTOM',
      name: 'approval-requested',
      data: {
        toolCallId: 'tc-2',
        toolName: 'dangerousTool',
        input: { action: 'delete' },
        approval: { id: 'approval-1', needsApproval: true },
      },
      timestamp: Date.now(),
    })

    // Custom event (should be forwarded)
    processor.processChunk({
      type: 'CUSTOM',
      name: 'user:custom-event',
      data: { message: 'This should be forwarded' },
      timestamp: Date.now(),
    })

    // System events should trigger their specific handlers, not onCustomEvent
    expect(onToolCall).toHaveBeenCalledTimes(1)
    expect(onApprovalRequest).toHaveBeenCalledTimes(1)

    // Only the user custom event should be forwarded
    expect(onCustomEvent).toHaveBeenCalledTimes(1)
    expect(onCustomEvent).toHaveBeenCalledWith(
      'user:custom-event',
      { message: 'This should be forwarded' },
      { toolCallId: undefined },
    )
  })
})
