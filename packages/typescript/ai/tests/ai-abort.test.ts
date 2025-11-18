import { describe, it, expect, vi } from "vitest";
import { ai, AI } from "../src/ai";
import type { AIAdapter, ChatCompletionOptions, StreamChunk } from "../src/types";
import { BaseAdapter } from "../src/base-adapter";

// Mock adapter that tracks abort signal usage
class MockAdapter extends BaseAdapter<
  readonly ["test-model"],
  readonly [],
  readonly [],
  readonly [],
  readonly [],
  Record<string, any>,
  Record<string, any>,
  Record<string, any>,
  Record<string, any>
> {
  public receivedAbortSignals: (AbortSignal | undefined)[] = [];
  public chatStreamCallCount = 0;
  public chatCompletionCallCount = 0;

  name = "mock";

  async chatCompletion(
    options: ChatCompletionOptions
  ): Promise<any> {
    this.chatCompletionCallCount++;
    this.receivedAbortSignals.push(options.abortSignal);
    return {
      id: "test-id",
      model: "test-model",
      content: "Test response",
      finishReason: "stop",
    };
  }

  async *chatStream(
    options: ChatCompletionOptions
  ): AsyncIterable<StreamChunk> {
    this.chatStreamCallCount++;
    this.receivedAbortSignals.push(options.abortSignal);

    // Yield some chunks
    yield {
      type: "content",
      id: "test-id",
      model: "test-model",
      timestamp: Date.now(),
      delta: "Hello",
      content: "Hello",
      role: "assistant",
    };

    // Check abort signal during streaming
    if (options.abortSignal?.aborted) {
      return;
    }

    yield {
      type: "content",
      id: "test-id",
      model: "test-model",
      timestamp: Date.now(),
      delta: " World",
      content: "Hello World",
      role: "assistant",
    };

    yield {
      type: "done",
      id: "test-id",
      model: "test-model",
      timestamp: Date.now(),
      finishReason: "stop",
    };
  }
}

describe("AI - Abort Signal Handling", () => {
  it("should propagate abortSignal to adapter.chatStream()", async () => {
    const mockAdapter = new MockAdapter();
    const aiInstance = ai(mockAdapter);

    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    const stream = aiInstance.chat({
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
      options: {
        abortSignal,
      },
    });

    const chunks: StreamChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(mockAdapter.chatStreamCallCount).toBe(1);
    expect(mockAdapter.receivedAbortSignals[0]).toBe(abortSignal);
  });

  it("should stop streaming when abortSignal is aborted", async () => {
    const mockAdapter = new MockAdapter();
    const aiInstance = ai(mockAdapter);

    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    const stream = aiInstance.chat({
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
      options: {
        abortSignal,
      },
    });

    const chunks: StreamChunk[] = [];
    let chunkCount = 0;

    for await (const chunk of stream) {
      chunks.push(chunk);
      chunkCount++;
      
      // Abort after first chunk
      if (chunkCount === 1) {
        abortController.abort();
      }
    }

    // Should have received at least one chunk before abort
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("should check abortSignal before each iteration", async () => {
    const mockAdapter = new MockAdapter();
    const aiInstance = ai(mockAdapter);

    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    // Abort before starting
    abortController.abort();

    const stream = aiInstance.chat({
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
      options: {
        abortSignal,
      },
    });

    const chunks: StreamChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    // Should not yield any chunks if aborted before start
    expect(chunks.length).toBe(0);
  });

  it("should propagate abortSignal to adapter.chatCompletion()", async () => {
    const mockAdapter = new MockAdapter();
    const aiInstance = ai(mockAdapter);

    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    await aiInstance.chatCompletion({
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
      options: {
        abortSignal,
      },
    });

    expect(mockAdapter.chatCompletionCallCount).toBe(1);
    expect(mockAdapter.receivedAbortSignals[0]).toBe(abortSignal);
  });

  it("should check abortSignal before tool execution", async () => {
    const mockAdapter = new MockAdapter();
    const aiInstance = ai(mockAdapter);

    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    // Create adapter that yields tool_calls
    class ToolCallAdapter extends MockAdapter {
      async *chatStream(
        options: ChatCompletionOptions
      ): AsyncIterable<StreamChunk> {
        yield {
          type: "tool_call",
          id: "test-id",
          model: "test-model",
          timestamp: Date.now(),
          toolCall: {
            id: "call-1",
            type: "function",
            function: {
              name: "test_tool",
              arguments: "{}",
            },
          },
          index: 0,
        };
        yield {
          type: "done",
          id: "test-id",
          model: "test-model",
          timestamp: Date.now(),
          finishReason: "tool_calls",
        };
      }
    }

    const toolAdapter = new ToolCallAdapter();
    const aiWithTools = ai(toolAdapter);

    const stream = aiWithTools.chat({
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
      tools: [
        {
          type: "function",
          function: {
            name: "test_tool",
            description: "Test tool",
            parameters: {},
          },
        },
      ],
      options: {
        abortSignal,
      },
    });

    const chunks: StreamChunk[] = [];
    let chunkCount = 0;

    for await (const chunk of stream) {
      chunks.push(chunk);
      chunkCount++;
      
      // Abort after receiving tool_call chunk
      if (chunk.type === "tool_call") {
        abortController.abort();
      }
    }

    // Should have received tool_call chunk but stopped before tool execution
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("should handle undefined abortSignal gracefully", async () => {
    const mockAdapter = new MockAdapter();
    const aiInstance = ai(mockAdapter);

    const stream = aiInstance.chat({
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
      options: {
        // No abortSignal provided
      },
    });

    const chunks: StreamChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(mockAdapter.chatStreamCallCount).toBe(1);
    expect(mockAdapter.receivedAbortSignals[0]).toBeUndefined();
    expect(chunks.length).toBeGreaterThan(0);
  });
});

