import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiEventClient } from '../src/event-client';

describe('AI Event Client', () => {
  beforeEach(() => {
    // Clear all listeners before each test
    aiEventClient.removeAllListeners();
  });

  it('should emit and receive chat:started events', () => {
    const handler = vi.fn();
    aiEventClient.on('chat:started', handler);

    const eventData = {
      type: 'instance' as const,
      timestamp: Date.now(),
      options: {
        model: 'gpt-4o',
        messages: [
          { role: 'user' as const, content: 'Hello' }
        ],
      },
    };

    aiEventClient.emit('chat:started', eventData);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(eventData);
  });

  it('should emit and receive usage:tokens events', () => {
    const handler = vi.fn();
    aiEventClient.on('usage:tokens', handler);

    const eventData = {
      type: 'instance' as const,
      timestamp: Date.now(),
      messageId: 'msg-123',
      model: 'gpt-4o',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };

    aiEventClient.emit('usage:tokens', eventData);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(eventData);
  });

  it('should handle stream:content events', () => {
    const handler = vi.fn();
    aiEventClient.on('stream:content', handler);

    const eventData = {
      type: 'instance' as const,
      timestamp: Date.now(),
      messageId: 'msg-123',
      model: 'gpt-4o',
      delta: 'Hello',
    };

    aiEventClient.emit('stream:content', eventData);

    expect(handler).toHaveBeenCalledWith(eventData);
  });

  it('should remove event listeners', () => {
    const handler = vi.fn();
    aiEventClient.on('stream:content', handler);

    aiEventClient.off('stream:content', handler);

    aiEventClient.emit('stream:content', {
      type: 'instance' as const,
      timestamp: Date.now(),
      messageId: 'msg-123',
      model: 'gpt-4o',
      delta: 'Hello',
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should support once() for single-use listeners', () => {
    const handler = vi.fn();
    aiEventClient.once('chat:completed', handler);

    const eventData = {
      type: 'instance' as const,
      timestamp: Date.now(),
      options: {
        model: 'gpt-4o',
        messages: [
          { role: 'user' as const, content: 'Hello' }
        ],
      },
      result: {
        id: '123',
        model: 'gpt-4o',
        content: 'test',
        role: 'assistant' as const,
        finishReason: 'stop' as const,
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      },
      duration: 1000,
    };

    // Emit twice
    aiEventClient.emit('chat:completed', eventData);
    aiEventClient.emit('chat:completed', eventData);

    // Handler should only be called once
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should handle tool events', () => {
    const approvalHandler = vi.fn();
    const completedHandler = vi.fn();

    aiEventClient.on('tool:approval-requested', approvalHandler);
    aiEventClient.on('tool:completed', completedHandler);

    aiEventClient.emit('tool:approval-requested', {
      type: 'instance' as const,
      timestamp: Date.now(),
      messageId: 'msg-123',
      model: 'gpt-4o',
      toolCallId: 'tool-123',
      toolName: 'test_tool',
      input: { test: true },
      approvalId: 'approval-123',
    });

    aiEventClient.emit('tool:completed', {
      type: 'instance' as const,
      timestamp: Date.now(),
      model: 'gpt-4o',
      toolCallId: 'tool-123',
      toolName: 'test_tool',
      result: { success: true },
      duration: 500,
    });

    expect(approvalHandler).toHaveBeenCalledTimes(1);
    expect(completedHandler).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple listeners for the same event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    aiEventClient.on('stream:content', handler1);
    aiEventClient.on('stream:content', handler2);

    const eventData = {
      type: 'instance' as const,
      timestamp: Date.now(),
      messageId: 'msg-123',
      model: 'gpt-4o',
      delta: 'Hello',
    };

    aiEventClient.emit('stream:content', eventData);

    expect(handler1).toHaveBeenCalledWith(eventData);
    expect(handler2).toHaveBeenCalledWith(eventData);
  });

  it('should remove all listeners for a specific event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    aiEventClient.on('stream:content', handler1);
    aiEventClient.on('stream:content', handler2);

    aiEventClient.removeAllListeners('stream:content');

    aiEventClient.emit('stream:content', {
      type: 'instance' as const,
      timestamp: Date.now(),
      messageId: 'msg-123',
      model: 'gpt-4o',
      delta: 'Hello',
    });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });
});
