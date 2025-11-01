import { describe, it, expect, vi } from "vitest";
import { StreamProcessor } from "../../src/stream/processor";
import {
  ImmediateStrategy,
  PunctuationStrategy,
  BatchStrategy,
} from "../../src/stream/chunk-strategies";
import type { StreamChunk, StreamProcessorHandlers } from "../../src/stream/types";

// Mock stream generator helper
async function* createMockStream(
  chunks: StreamChunk[]
): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe("StreamProcessor", () => {
  describe("Text Streaming", () => {
    it("should accumulate text content", async () => {
      const handlers: StreamProcessorHandlers = {
        onTextUpdate: vi.fn(),
        onStreamEnd: vi.fn(),
      };

      const processor = new StreamProcessor({
        chunkStrategy: new ImmediateStrategy(),
        handlers,
      });

      const stream = createMockStream([
        { type: "text", content: "Hello" },
        { type: "text", content: " world" },
        { type: "text", content: "!" },
      ]);

      const result = await processor.process(stream);

      expect(result.content).toBe("Hello world!");
      expect(handlers.onTextUpdate).toHaveBeenCalledTimes(3);
      expect(handlers.onTextUpdate).toHaveBeenNthCalledWith(1, "Hello");
      expect(handlers.onTextUpdate).toHaveBeenNthCalledWith(2, "Hello world");
      expect(handlers.onTextUpdate).toHaveBeenNthCalledWith(3, "Hello world!");
    });

    it("should respect ImmediateStrategy", async () => {
      const handlers: StreamProcessorHandlers = {
        onTextUpdate: vi.fn(),
      };

      const processor = new StreamProcessor({
        chunkStrategy: new ImmediateStrategy(),
        handlers,
      });

      const stream = createMockStream([
        { type: "text", content: "Hello" },
        { type: "text", content: " world" },
      ]);

      await processor.process(stream);

      expect(handlers.onTextUpdate).toHaveBeenCalledTimes(2);
    });

    it("should respect PunctuationStrategy", async () => {
      const handlers: StreamProcessorHandlers = {
        onTextUpdate: vi.fn(),
      };

      const processor = new StreamProcessor({
        chunkStrategy: new PunctuationStrategy(),
        handlers,
      });

      const stream = createMockStream([
        { type: "text", content: "Hello" },
        { type: "text", content: " world" },
        { type: "text", content: "!" },
        { type: "text", content: " How" },
        { type: "text", content: " are" },
        { type: "text", content: " you?" },
      ]);

      await processor.process(stream);

      // Should only emit on punctuation (! and ?)
      expect(handlers.onTextUpdate).toHaveBeenCalledTimes(2);
      expect(handlers.onTextUpdate).toHaveBeenNthCalledWith(1, "Hello world!");
      expect(handlers.onTextUpdate).toHaveBeenNthCalledWith(
        2,
        "Hello world! How are you?"
      );
    });

    it("should respect BatchStrategy", async () => {
      const handlers: StreamProcessorHandlers = {
        onTextUpdate: vi.fn(),
      };

      const processor = new StreamProcessor({
        chunkStrategy: new BatchStrategy(3),
        handlers,
      });

      const stream = createMockStream([
        { type: "text", content: "1" },
        { type: "text", content: "2" },
        { type: "text", content: "3" },
        { type: "text", content: "4" },
        { type: "text", content: "5" },
        { type: "text", content: "6" },
      ]);

      await processor.process(stream);

      // Should emit on chunks 3 and 6
      expect(handlers.onTextUpdate).toHaveBeenCalledTimes(2);
      expect(handlers.onTextUpdate).toHaveBeenNthCalledWith(1, "123");
      expect(handlers.onTextUpdate).toHaveBeenNthCalledWith(2, "123456");
    });

    it("should emit final text on stream end even if strategy hasn't triggered", async () => {
      const handlers: StreamProcessorHandlers = {
        onTextUpdate: vi.fn(),
        onStreamEnd: vi.fn(),
      };

      const processor = new StreamProcessor({
        chunkStrategy: new BatchStrategy(10), // High batch size
        handlers,
      });

      const stream = createMockStream([
        { type: "text", content: "Hello" },
        { type: "text", content: " world" },
      ]);

      const result = await processor.process(stream);

      expect(result.content).toBe("Hello world");
      expect(handlers.onStreamEnd).toHaveBeenCalledWith(
        "Hello world",
        undefined
      );
    });
  });

  describe("Single Tool Call", () => {
    it("should track a single tool call", async () => {
      const handlers: StreamProcessorHandlers = {
        onToolCallStart: vi.fn(),
        onToolCallDelta: vi.fn(),
        onToolCallComplete: vi.fn(),
        onStreamEnd: vi.fn(),
      };

      const processor = new StreamProcessor({
        handlers,
      });

      const stream = createMockStream([
        {
          type: "tool-call-delta",
          toolCallIndex: 0,
          toolCall: {
            id: "call_1",
            function: { name: "getWeather", arguments: '{"lo' },
          },
        },
        {
          type: "tool-call-delta",
          toolCallIndex: 0,
          toolCall: {
            id: "call_1",
            function: { name: "getWeather", arguments: 'cation":' },
          },
        },
        {
          type: "tool-call-delta",
          toolCallIndex: 0,
          toolCall: {
            id: "call_1",
            function: { name: "getWeather", arguments: ' "Paris"}' },
          },
        },
      ]);

      const result = await processor.process(stream);

      // Verify start event
      expect(handlers.onToolCallStart).toHaveBeenCalledTimes(1);
      expect(handlers.onToolCallStart).toHaveBeenCalledWith(
        0,
        "call_1",
        "getWeather"
      );

      // Verify delta events
      expect(handlers.onToolCallDelta).toHaveBeenCalledTimes(3);
      expect(handlers.onToolCallDelta).toHaveBeenNthCalledWith(1, 0, '{"lo');
      expect(handlers.onToolCallDelta).toHaveBeenNthCalledWith(2, 0, 'cation":');
      expect(handlers.onToolCallDelta).toHaveBeenNthCalledWith(
        3,
        0,
        ' "Paris"}'
      );

      // Verify completion (triggered by stream end)
      expect(handlers.onToolCallComplete).toHaveBeenCalledTimes(1);
      expect(handlers.onToolCallComplete).toHaveBeenCalledWith(
        0,
        "call_1",
        "getWeather",
        '{"location": "Paris"}'
      );

      // Verify result
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: "call_1",
        type: "function",
        function: {
          name: "getWeather",
          arguments: '{"location": "Paris"}',
        },
      });
    });
  });

  describe("Parallel Tool Calls", () => {
    it("should handle multiple parallel tool calls", async () => {
      const handlers: StreamProcessorHandlers = {
        onToolCallStart: vi.fn(),
        onToolCallDelta: vi.fn(),
        onToolCallComplete: vi.fn(),
        onStreamEnd: vi.fn(),
      };

      const processor = new StreamProcessor({
        handlers,
      });

      const stream = createMockStream([
        {
          type: "tool-call-delta",
          toolCallIndex: 0,
          toolCall: {
            id: "call_1",
            function: { name: "getWeather", arguments: '{"lo' },
          },
        },
        {
          type: "tool-call-delta",
          toolCallIndex: 1,
          toolCall: {
            id: "call_2",
            function: { name: "getTime", arguments: '{"ci' },
          },
        },
        {
          type: "tool-call-delta",
          toolCallIndex: 0,
          toolCall: {
            id: "call_1",
            function: { name: "getWeather", arguments: 'cation":"Paris"}' },
          },
        },
        {
          type: "tool-call-delta",
          toolCallIndex: 1,
          toolCall: {
            id: "call_2",
            function: { name: "getTime", arguments: 'ty":"Tokyo"}' },
          },
        },
      ]);

      const result = await processor.process(stream);

      // Should start both tool calls
      expect(handlers.onToolCallStart).toHaveBeenCalledTimes(2);
      expect(handlers.onToolCallStart).toHaveBeenNthCalledWith(
        1,
        0,
        "call_1",
        "getWeather"
      );
      expect(handlers.onToolCallStart).toHaveBeenNthCalledWith(
        2,
        1,
        "call_2",
        "getTime"
      );

      // Tool 0 completes when tool 1 starts
      expect(handlers.onToolCallComplete).toHaveBeenCalledTimes(2);

      // Both tool calls in result
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls![0].function.name).toBe("getWeather");
      expect(result.toolCalls![1].function.name).toBe("getTime");
    });

    it("should complete tool calls when switching indices", async () => {
      const handlers: StreamProcessorHandlers = {
        onToolCallComplete: vi.fn(),
      };

      const processor = new StreamProcessor({
        handlers,
      });

      const stream = createMockStream([
        {
          type: "tool-call-delta",
          toolCallIndex: 0,
          toolCall: {
            id: "call_1",
            function: { name: "tool1", arguments: "args1" },
          },
        },
        {
          type: "tool-call-delta",
          toolCallIndex: 1,
          toolCall: {
            id: "call_2",
            function: { name: "tool2", arguments: "args2" },
          },
        },
      ]);

      await processor.process(stream);

      // Tool 0 should complete when tool 1 starts
      expect(handlers.onToolCallComplete).toHaveBeenNthCalledWith(
        1,
        0,
        "call_1",
        "tool1",
        "args1"
      );
    });
  });

  describe("Mixed: Tool Calls + Text", () => {
    it("should complete tool calls when text arrives", async () => {
      const handlers: StreamProcessorHandlers = {
        onToolCallStart: vi.fn(),
        onToolCallComplete: vi.fn(),
        onTextUpdate: vi.fn(),
        onStreamEnd: vi.fn(),
      };

      const processor = new StreamProcessor({
        chunkStrategy: new ImmediateStrategy(),
        handlers,
      });

      const stream = createMockStream([
        {
          type: "tool-call-delta",
          toolCallIndex: 0,
          toolCall: {
            id: "call_1",
            function: { name: "getWeather", arguments: '{"location":"Paris"}' },
          },
        },
        { type: "text", content: "The weather in Paris is" },
        { type: "text", content: " sunny" },
        { type: "text", content: " and warm." },
      ]);

      const result = await processor.process(stream);

      // Tool call should start
      expect(handlers.onToolCallStart).toHaveBeenCalledWith(
        0,
        "call_1",
        "getWeather"
      );

      // Tool call should complete when text arrives
      expect(handlers.onToolCallComplete).toHaveBeenCalledWith(
        0,
        "call_1",
        "getWeather",
        '{"location":"Paris"}'
      );

      // Text should accumulate
      expect(result.content).toBe("The weather in Paris is sunny and warm.");

      // Should have both tool calls and text
      expect(result.toolCalls).toHaveLength(1);
      expect(result.content).toBeTruthy();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty stream", async () => {
      const handlers: StreamProcessorHandlers = {
        onStreamEnd: vi.fn(),
      };

      const processor = new StreamProcessor({
        handlers,
      });

      const stream = createMockStream([]);
      const result = await processor.process(stream);

      expect(result.content).toBe("");
      expect(result.toolCalls).toBeUndefined();
      expect(handlers.onStreamEnd).toHaveBeenCalledWith("", undefined);
    });

    it("should handle text-only stream", async () => {
      const processor = new StreamProcessor({
        handlers: {},
      });

      const stream = createMockStream([
        { type: "text", content: "Hello world" },
      ]);

      const result = await processor.process(stream);

      expect(result.content).toBe("Hello world");
      expect(result.toolCalls).toBeUndefined();
    });

    it("should handle tool-calls-only stream", async () => {
      const processor = new StreamProcessor({
        handlers: {},
      });

      const stream = createMockStream([
        {
          type: "tool-call-delta",
          toolCallIndex: 0,
          toolCall: {
            id: "call_1",
            function: { name: "test", arguments: "args" },
          },
        },
      ]);

      const result = await processor.process(stream);

      expect(result.content).toBe("");
      expect(result.toolCalls).toHaveLength(1);
    });

    it("should handle missing optional handlers gracefully", async () => {
      const processor = new StreamProcessor({
        handlers: {}, // No handlers
      });

      const stream = createMockStream([
        { type: "text", content: "Hello" },
        {
          type: "tool-call-delta",
          toolCallIndex: 0,
          toolCall: {
            id: "call_1",
            function: { name: "test", arguments: "args" },
          },
        },
      ]);

      // Should not throw
      const result = await processor.process(stream);
      expect(result).toBeDefined();
    });
  });

  describe("Stream End Events", () => {
    it("should call onStreamEnd with final content and tool calls", async () => {
      const handlers: StreamProcessorHandlers = {
        onStreamEnd: vi.fn(),
      };

      const processor = new StreamProcessor({
        handlers,
      });

      const stream = createMockStream([
        { type: "text", content: "Hello" },
        {
          type: "tool-call-delta",
          toolCallIndex: 0,
          toolCall: {
            id: "call_1",
            function: { name: "test", arguments: "args" },
          },
        },
      ]);

      await processor.process(stream);

      expect(handlers.onStreamEnd).toHaveBeenCalledWith("Hello", [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "test",
            arguments: "args",
          },
        },
      ]);
    });

    it("should call onStreamEnd with undefined toolCalls if none exist", async () => {
      const handlers: StreamProcessorHandlers = {
        onStreamEnd: vi.fn(),
      };

      const processor = new StreamProcessor({
        handlers,
      });

      const stream = createMockStream([{ type: "text", content: "Hello" }]);

      await processor.process(stream);

      expect(handlers.onStreamEnd).toHaveBeenCalledWith("Hello", undefined);
    });
  });
});

