import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ai } from "../src/ai";
import type {
  ChatCompletionOptions,
  StreamChunk,
  Tool,
  ModelMessage,
} from "../src/types";
import { BaseAdapter } from "../src/base-adapter";
import { aiEventClient } from "../src/event-client.js";
import { maxIterations } from "../src/agent-loop-strategies";

// Mock event client to track events
const eventListeners = new Map<string, Set<Function>>();
const capturedEvents: Array<{ type: string; data: any }> = [];

beforeEach(() => {
  eventListeners.clear();
  capturedEvents.length = 0;

  // Mock event client emit
  vi.spyOn(aiEventClient, "emit").mockImplementation((event, data) => {
    capturedEvents.push({ type: event as string, data });
    const listeners = eventListeners.get(event as string);
    if (listeners) {
      listeners.forEach((listener) => listener(data));
    }
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Mock adapter base class with consistent tracking helper
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
  public chatStreamCallCount = 0;
  public chatCompletionCallCount = 0;
  public chatStreamCalls: Array<{
    model: string;
    messages: ModelMessage[];
    tools?: Tool[];
    request?: ChatCompletionOptions["request"];
    providerOptions?: any;
  }> = [];

  name = "mock";
  models = ["test-model"] as const;

  // Helper method for consistent tracking when subclasses override chatStream
  protected trackStreamCall(options: ChatCompletionOptions): void {
    this.chatStreamCallCount++;
    this.chatStreamCalls.push({
      model: options.model,
      messages: options.messages,
      tools: options.tools,
      request: options.request,
      providerOptions: options.providerOptions,
    });
  }

  // Default implementation - will be overridden in tests
  async *chatStream(
    options: ChatCompletionOptions
  ): AsyncIterable<StreamChunk> {
    this.trackStreamCall(options);
    yield {
      type: "content",
      id: "test-id",
      model: "test-model",
      timestamp: Date.now(),
      delta: "Hello",
      content: "Hello",
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

  async chatCompletion(_options: ChatCompletionOptions): Promise<any> {
    this.chatCompletionCallCount++;
    return {
      id: "test-id",
      model: "test-model",
      content: "Test response",
      finishReason: "stop",
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    };
  }

  async summarize(_options: any): Promise<any> {
    return { summary: "test" };
  }

  async createEmbeddings(_options: any): Promise<any> {
    return { embeddings: [] };
  }
}

// Helper to collect all chunks from a stream
async function collectChunks<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const chunks: T[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("AI.chat() - Comprehensive Logic Path Coverage", () => {
  describe("Initialization & Setup", () => {
    it("should generate unique request and stream IDs", async () => {
      const adapter = new MockAdapter();
      const aiInstance = ai(adapter);

      const stream1 = aiInstance.chat({
        model: "test-model",
        messages: [{ role: "user", content: "Hello" }],
      });

      const stream2 = aiInstance.chat({
        model: "test-model",
        messages: [{ role: "user", content: "Hi" }],
      });

      const [chunks1, chunks2] = await Promise.all([
        collectChunks(stream1),
        collectChunks(stream2),
      ]);

      const event1 = capturedEvents.find((e) => e.type === "chat:started");
      const event2 = capturedEvents
        .slice()
        .reverse()
        .find((e) => e.type === "chat:started");

      expect(event1).toBeDefined();
      expect(event2).toBeDefined();
      expect(event1?.data.requestId).not.toBe(event2?.data.requestId);
      expect(chunks1.length).toBeGreaterThan(0);
      expect(chunks2.length).toBeGreaterThan(0);
    });

    it("should emit chat:started event with correct data", async () => {
      const adapter = new MockAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [
            { role: "user", content: "Hello" },
            { role: "user", content: "Hi" },
          ],
          tools: [
            {
              type: "function",
              function: { name: "test", description: "test", parameters: {} },
            },
          ],
        })
      );

      const event = capturedEvents.find((e) => e.type === "chat:started");
      expect(event).toBeDefined();
      expect(event?.data.model).toBe("test-model");
      expect(event?.data.messageCount).toBe(2);
      expect(event?.data.hasTools).toBe(true);
      expect(event?.data.streaming).toBe(true);
    });

    it("should emit stream:started event with correct data", async () => {
      const adapter = new MockAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Hello" }],
        })
      );

      const event = capturedEvents.find((e) => e.type === "stream:started");
      expect(event).toBeDefined();
      expect(event?.data.model).toBe("test-model");
      expect(event?.data.provider).toBe("mock");
    });

    it("should prepend system prompts correctly (request-level overrides instance-level)", async () => {
      const adapter = new MockAdapter();
      const aiInstance = ai(adapter, {
        systemPrompts: ["You are helpful"],
      });

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Hello" }],
          systemPrompts: ["You are concise"],
        })
      );

      const call = adapter.chatStreamCalls[0];
      expect(call.messages[0].role).toBe("system");
      expect(call.messages[0].content).toBe("You are concise");
      expect(call.messages.length).toBe(2);
    });

    it("should prepend instance-level system prompts when no request-level prompts", async () => {
      const adapter = new MockAdapter();
      const aiInstance = ai(adapter, {
        systemPrompts: ["You are helpful", "You are concise"],
      });

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Hello" }],
        })
      );

      const call = adapter.chatStreamCalls[0];
      expect(call.messages).toHaveLength(3);
      expect(call.messages[0].role).toBe("system");
      expect(call.messages[0].content).toBe("You are helpful");
      expect(call.messages[1].role).toBe("system");
      expect(call.messages[1].content).toBe("You are concise");
      expect(call.messages[2].role).toBe("user");
    });

    it("should pass providerOptions to adapter", async () => {
      const adapter = new MockAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Hello" }],
          providerOptions: { customOption: "value" },
        })
      );

      expect(adapter.chatStreamCalls[0].providerOptions).toEqual({
        customOption: "value",
      });
    });
  });

  describe("Content Streaming Paths", () => {
    it("should stream simple content without tools", async () => {
      const adapter = new MockAdapter();
      const aiInstance = ai(adapter);

      const stream = aiInstance.chat({
        model: "test-model",
        messages: [{ role: "user", content: "Hello" }],
      });

      const chunks = await collectChunks(stream);

      expect(adapter.chatStreamCallCount).toBe(1);
      expect(chunks).toHaveLength(2);
      expect(chunks[0].type).toBe("content");
      expect(chunks[1].type).toBe("done");

      // Check events
      expect(capturedEvents.some((e) => e.type === "chat:started")).toBe(true);
      expect(capturedEvents.some((e) => e.type === "stream:started")).toBe(
        true
      );
      expect(
        capturedEvents.some((e) => e.type === "stream:chunk:content")
      ).toBe(true);
      expect(capturedEvents.some((e) => e.type === "stream:chunk:done")).toBe(
        true
      );
      expect(capturedEvents.some((e) => e.type === "stream:ended")).toBe(true);
    });

    it("should accumulate content across multiple chunks", async () => {
      class ContentAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "content",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            delta: "Hello",
            content: "Hello",
            role: "assistant",
          };
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
            type: "content",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            delta: "!",
            content: "Hello World!",
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

      const adapter = new ContentAdapter();
      const aiInstance = ai(adapter);

      const stream = aiInstance.chat({
        model: "test-model",
        messages: [{ role: "user", content: "Say hello" }],
      });

      const chunks = await collectChunks(stream);
      const contentChunks = chunks.filter((c) => c.type === "content");

      expect(contentChunks).toHaveLength(3);
      expect((contentChunks[0] as any).content).toBe("Hello");
      expect((contentChunks[1] as any).content).toBe("Hello World");
      expect((contentChunks[2] as any).content).toBe("Hello World!");

      // Check content events
      const contentEvents = capturedEvents.filter(
        (e) => e.type === "stream:chunk:content"
      );
      expect(contentEvents).toHaveLength(3);
    });

    it("should handle empty content chunks", async () => {
      class EmptyContentAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "content",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            delta: "",
            content: "",
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

      const adapter = new EmptyContentAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
        })
      );

      expect(chunks[0].type).toBe("content");
      expect((chunks[0] as any).content).toBe("");
    });
  });

  describe("Tool Call Paths", () => {
    it("should handle single tool call and execute it", async () => {
      const tool: Tool = {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get weather",
          parameters: {},
        },
        execute: vi.fn(async (args: any) =>
          JSON.stringify({ temp: 72, location: args.location })
        ),
      };

      class ToolAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);

          if (this.iteration === 0) {
            this.iteration++;
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"location":"Paris"}',
                },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            yield {
              type: "content",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Done",
              content: "Done",
              role: "assistant",
            };
            yield {
              type: "done",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
          }
        }
      }

      const adapter = new ToolAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Weather?" }],
          tools: [tool],
        })
      );

      expect(tool.execute).toHaveBeenCalledWith({ location: "Paris" });
      expect(adapter.chatStreamCallCount).toBeGreaterThanOrEqual(2);

      const toolResultChunks = chunks.filter((c) => c.type === "tool_result");
      expect(toolResultChunks).toHaveLength(1);

      // Check events
      expect(
        capturedEvents.some((e) => e.type === "stream:chunk:tool-call")
      ).toBe(true);
      expect(capturedEvents.some((e) => e.type === "chat:iteration")).toBe(
        true
      );
      expect(capturedEvents.some((e) => e.type === "tool:call-completed")).toBe(
        true
      );
    });

    it("should handle streaming tool call arguments (incremental JSON)", async () => {
      const tool: Tool = {
        type: "function",
        function: {
          name: "calculate",
          description: "Calculate",
          parameters: {},
        },
        execute: vi.fn(async (args: any) =>
          JSON.stringify({ result: args.a + args.b })
        ),
      };

      class StreamingToolAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);

          if (this.iteration === 0) {
            this.iteration++;
            // Simulate streaming tool arguments
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: {
                  name: "calculate",
                  arguments: '{"a":10,',
                },
              },
              index: 0,
            };
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: {
                  name: "calculate",
                  arguments: '"b":20}',
                },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            yield {
              type: "content",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Result",
              content: "Result",
              role: "assistant",
            };
            yield {
              type: "done",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
          }
        }
      }

      const adapter = new StreamingToolAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Calculate" }],
          tools: [tool],
        })
      );

      // Tool should be executed with complete arguments
      expect(tool.execute).toHaveBeenCalledWith({ a: 10, b: 20 });
      const toolResultChunks = chunks.filter((c) => c.type === "tool_result");
      expect(toolResultChunks.length).toBeGreaterThan(0);
    });

    it("should handle multiple tool calls in same iteration", async () => {
      const tool1: Tool = {
        type: "function",
        function: { name: "tool1", description: "Tool 1", parameters: {} },
        execute: vi.fn(async () => JSON.stringify({ result: 1 })),
      };

      const tool2: Tool = {
        type: "function",
        function: { name: "tool2", description: "Tool 2", parameters: {} },
        execute: vi.fn(async () => JSON.stringify({ result: 2 })),
      };

      class MultipleToolsAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);

          if (this.iteration === 0) {
            this.iteration++;
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: { name: "tool1", arguments: "{}" },
              },
              index: 0,
            };
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-2",
                type: "function",
                function: { name: "tool2", arguments: "{}" },
              },
              index: 1,
            };
            yield {
              type: "done",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            yield {
              type: "content",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Done",
              content: "Done",
              role: "assistant",
            };
            yield {
              type: "done",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
          }
        }
      }

      const adapter = new MultipleToolsAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Use both tools" }],
          tools: [tool1, tool2],
        })
      );

      expect(tool1.execute).toHaveBeenCalled();
      expect(tool2.execute).toHaveBeenCalled();

      const toolResultChunks = chunks.filter((c) => c.type === "tool_result");
      expect(toolResultChunks).toHaveLength(2);

      // Check iteration event
      const iterationEvents = capturedEvents.filter(
        (e) => e.type === "chat:iteration"
      );
      expect(iterationEvents.length).toBeGreaterThan(0);
      expect(iterationEvents[0].data.toolCallCount).toBe(2);
    });

    it("should handle tool calls with accumulated content", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "test_tool", description: "Test", parameters: {} },
        execute: vi.fn(async () => JSON.stringify({ result: "ok" })),
      };

      class ContentWithToolsAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);

          if (this.iteration === 0) {
            this.iteration++;
            yield {
              type: "content",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Let me",
              content: "Let me",
              role: "assistant",
            };
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: { name: "test_tool", arguments: "{}" },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            // Second iteration should have assistant message with content and tool calls
            const messages = options.messages;
            const assistantMsg = messages.find(
              (m) => m.role === "assistant" && m.toolCalls
            );
            expect(assistantMsg).toBeDefined();
            expect(assistantMsg?.content).toBe("Let me");

            yield {
              type: "content",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Done",
              content: "Done",
              role: "assistant",
            };
            yield {
              type: "done",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
          }
        }
      }

      const adapter = new ContentWithToolsAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
          tools: [tool],
        })
      );

      expect(adapter.chatStreamCallCount).toBe(2);
    });

    it("should handle tool calls without accumulated content", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "test_tool", description: "Test", parameters: {} },
        execute: vi.fn(async () => JSON.stringify({ result: "ok" })),
      };

      class NoContentToolsAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);

          if (this.iteration === 0) {
            this.iteration++;
            // Only tool call, no content
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: { name: "test_tool", arguments: "{}" },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            // Second iteration should have assistant message with null content
            const messages = options.messages;
            const assistantMsg = messages.find(
              (m) => m.role === "assistant" && m.toolCalls
            );
            expect(assistantMsg?.content).toBeNull();

            yield {
              type: "content",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Done",
              content: "Done",
              role: "assistant",
            };
            yield {
              type: "done",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
          }
        }
      }

      const adapter = new NoContentToolsAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
          tools: [tool],
        })
      );

      expect(adapter.chatStreamCallCount).toBe(2);
    });

    it("should handle incomplete tool calls (empty name)", async () => {
      const tool: Tool = {
        type: "function",
        function: {
          name: "test_tool",
          description: "Test",
          parameters: {},
        },
        execute: vi.fn(),
      };

      class IncompleteToolAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          // Incomplete tool call (empty name)
          yield {
            type: "tool_call",
            id: "test-id-1",
            model: "test-model",
            timestamp: Date.now(),
            toolCall: {
              id: "call-1",
              type: "function",
              function: {
                name: "",
                arguments: "{}",
              },
            },
            index: 0,
          };
          yield {
            type: "done",
            id: "test-id-1",
            model: "test-model",
            timestamp: Date.now(),
            finishReason: "tool_calls",
          };
        }
      }

      const adapter = new IncompleteToolAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
          tools: [tool],
        })
      );

      // Should not execute tool (incomplete)
      expect(tool.execute).not.toHaveBeenCalled();

      // Should exit loop since no valid tool calls
      expect(adapter.chatStreamCallCount).toBe(1);
    });
  });

  describe("Tool Execution Result Paths", () => {
    it("should emit tool_result chunks after execution", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "test_tool", description: "Test", parameters: {} },
        execute: vi.fn(async () => JSON.stringify({ result: "success" })),
      };

      class ToolResultAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          if (this.iteration === 0) {
            this.iteration++;
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: { name: "test_tool", arguments: "{}" },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            yield {
              type: "content",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Done",
              content: "Done",
              role: "assistant",
            };
            yield {
              type: "done",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
          }
        }
      }

      const adapter = new ToolResultAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
          tools: [tool],
        })
      );

      const toolResultChunks = chunks.filter((c) => c.type === "tool_result");
      expect(toolResultChunks).toHaveLength(1);

      const resultChunk = toolResultChunks[0] as any;
      const result = JSON.parse(resultChunk.content);
      expect(result.result).toBe("success");

      // Check tool:call-completed event
      const completedEvents = capturedEvents.filter(
        (e) => e.type === "tool:call-completed"
      );
      expect(completedEvents.length).toBeGreaterThan(0);
    });

    it("should add tool result messages to conversation", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "test_tool", description: "Test", parameters: {} },
        execute: vi.fn(async () => JSON.stringify({ result: "ok" })),
      };

      class MessageHistoryAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);

          if (this.iteration === 0) {
            this.iteration++;
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: { name: "test_tool", arguments: "{}" },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            // Second iteration should have tool result message
            const messages = options.messages;
            const toolMessages = messages.filter((m) => m.role === "tool");
            expect(toolMessages.length).toBeGreaterThan(0);
            expect(toolMessages[0].toolCallId).toBe("call-1");

            yield {
              type: "content",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Done",
              content: "Done",
              role: "assistant",
            };
            yield {
              type: "done",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
          }
        }
      }

      const adapter = new MessageHistoryAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
          tools: [tool],
        })
      );
    });

    it("should handle tool execution errors gracefully", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "error_tool", description: "Error", parameters: {} },
        execute: vi.fn(async () => {
          throw new Error("Tool execution failed");
        }),
      };

      class ErrorToolAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          if (this.iteration === 0) {
            this.iteration++;
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: { name: "error_tool", arguments: "{}" },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            yield {
              type: "content",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Error occurred",
              content: "Error occurred",
              role: "assistant",
            };
            yield {
              type: "done",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
          }
        }
      }

      const adapter = new ErrorToolAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Call error tool" }],
          tools: [tool],
        })
      );

      const toolResultChunks = chunks.filter((c) => c.type === "tool_result");
      expect(toolResultChunks).toHaveLength(1);

      const resultChunk = toolResultChunks[0] as any;
      const result = JSON.parse(resultChunk.content);
      expect(result.error).toBe("Tool execution failed");
    });

    it("should handle unknown tool calls", async () => {
      class UnknownToolAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "tool_call",
            id: "test-id-1",
            model: "test-model",
            timestamp: Date.now(),
            toolCall: {
              id: "call-1",
              type: "function",
              function: { name: "unknown_tool", arguments: "{}" },
            },
            index: 0,
          };
          yield {
            type: "done",
            id: "test-id-1",
            model: "test-model",
            timestamp: Date.now(),
            finishReason: "tool_calls",
          };
        }
      }

      const adapter = new UnknownToolAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
          tools: [
            {
              type: "function",
              function: {
                name: "known_tool",
                description: "Known",
                parameters: {},
              },
            },
          ],
        })
      );

      // Should still produce a tool_result with error
      const toolResultChunks = chunks.filter((c) => c.type === "tool_result");
      expect(toolResultChunks.length).toBeGreaterThan(0);

      const resultChunk = toolResultChunks[0] as any;
      const result = JSON.parse(resultChunk.content);
      expect(result.error).toContain("Unknown tool");
    });
  });

  describe("Approval & Client Tool Paths", () => {
    it("should handle approval-required tools", async () => {
      const tool: Tool = {
        type: "function",
        function: {
          name: "delete_file",
          description: "Delete",
          parameters: {},
        },
        needsApproval: true,
        execute: vi.fn(async () => JSON.stringify({ success: true })),
      };

      class ApprovalAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "tool_call",
            id: "test-id-1",
            model: "test-model",
            timestamp: Date.now(),
            toolCall: {
              id: "call-1",
              type: "function",
              function: {
                name: "delete_file",
                arguments: '{"path":"/tmp/test.txt"}',
              },
            },
            index: 0,
          };
          yield {
            type: "done",
            id: "test-id-1",
            model: "test-model",
            timestamp: Date.now(),
            finishReason: "tool_calls",
          };
        }
      }

      const adapter = new ApprovalAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Delete file" }],
          tools: [tool],
        })
      );

      const approvalChunks = chunks.filter(
        (c) => c.type === "approval-requested"
      );
      expect(approvalChunks).toHaveLength(1);

      const approvalChunk = approvalChunks[0] as any;
      expect(approvalChunk.toolName).toBe("delete_file");
      expect(approvalChunk.approval.needsApproval).toBe(true);

      // Tool should NOT be executed yet
      expect(tool.execute).not.toHaveBeenCalled();

      // Should emit approval-requested event
      expect(
        capturedEvents.some((e) => e.type === "stream:approval-requested")
      ).toBe(true);
    });

    it("should handle client-side tools (no execute)", async () => {
      const tool: Tool = {
        type: "function",
        function: {
          name: "client_tool",
          description: "Client",
          parameters: {},
        },
        // No execute function
      };

      class ClientToolAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "tool_call",
            id: "test-id-1",
            model: "test-model",
            timestamp: Date.now(),
            toolCall: {
              id: "call-1",
              type: "function",
              function: { name: "client_tool", arguments: '{"input":"test"}' },
            },
            index: 0,
          };
          yield {
            type: "done",
            id: "test-id-1",
            model: "test-model",
            timestamp: Date.now(),
            finishReason: "tool_calls",
          };
        }
      }

      const adapter = new ClientToolAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Use client tool" }],
          tools: [tool],
        })
      );

      const inputChunks = chunks.filter(
        (c) => c.type === "tool-input-available"
      );
      expect(inputChunks).toHaveLength(1);

      const inputChunk = inputChunks[0] as any;
      expect(inputChunk.toolName).toBe("client_tool");
      expect(inputChunk.input).toEqual({ input: "test" });

      // Should emit tool-input-available event
      expect(
        capturedEvents.some((e) => e.type === "stream:tool-input-available")
      ).toBe(true);
    });

    it("should handle mixed tools (approval + client + normal)", async () => {
      const normalTool: Tool = {
        type: "function",
        function: { name: "normal", description: "Normal", parameters: {} },
        execute: vi.fn(async () => JSON.stringify({ result: "ok" })),
      };

      const approvalTool: Tool = {
        type: "function",
        function: { name: "approval", description: "Approval", parameters: {} },
        needsApproval: true,
        execute: vi.fn(async () => JSON.stringify({ success: true })),
      };

      const clientTool: Tool = {
        type: "function",
        function: { name: "client", description: "Client", parameters: {} },
        // No execute
      };

      class MixedToolsAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "tool_call",
            id: "test-id-1",
            model: "test-model",
            timestamp: Date.now(),
            toolCall: {
              id: "call-1",
              type: "function",
              function: { name: "normal", arguments: "{}" },
            },
            index: 0,
          };
          yield {
            type: "tool_call",
            id: "test-id-1",
            model: "test-model",
            timestamp: Date.now(),
            toolCall: {
              id: "call-2",
              type: "function",
              function: { name: "approval", arguments: "{}" },
            },
            index: 1,
          };
          yield {
            type: "tool_call",
            id: "test-id-1",
            model: "test-model",
            timestamp: Date.now(),
            toolCall: {
              id: "call-3",
              type: "function",
              function: { name: "client", arguments: "{}" },
            },
            index: 2,
          };
          yield {
            type: "done",
            id: "test-id-1",
            model: "test-model",
            timestamp: Date.now(),
            finishReason: "tool_calls",
          };
        }
      }

      const adapter = new MixedToolsAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Use all tools" }],
          tools: [normalTool, approvalTool, clientTool],
        })
      );

      // Normal tool should be executed
      expect(normalTool.execute).toHaveBeenCalled();

      // Approval and client tools should request intervention
      const approvalChunks = chunks.filter(
        (c) => c.type === "approval-requested"
      );
      const inputChunks = chunks.filter(
        (c) => c.type === "tool-input-available"
      );

      expect(approvalChunks.length + inputChunks.length).toBeGreaterThan(0);

      // Should stop after emitting approval/client chunks
      expect(approvalTool.execute).not.toHaveBeenCalled();
    });

    it("should execute pending tool calls before streaming when approvals already exist", async () => {
      const toolExecute = vi
        .fn()
        .mockResolvedValue(JSON.stringify({ success: true }));

      const approvalTool: Tool = {
        type: "function",
        function: {
          name: "approval_tool",
          description: "Needs approval",
          parameters: {},
        },
        needsApproval: true,
        execute: toolExecute,
      };

      class PendingToolAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);

          const toolMessage = options.messages.find(
            (msg) => msg.role === "tool"
          );
          expect(toolMessage).toBeDefined();
          expect(toolMessage?.toolCallId).toBe("call-1");
          expect(toolMessage?.content).toBe(
            JSON.stringify({ success: true })
          );

          yield {
            type: "content",
            id: "done-id",
            model: "test-model",
            timestamp: Date.now(),
            delta: "Finished",
            content: "Finished",
            role: "assistant",
          };
          yield {
            type: "done",
            id: "done-id",
            model: "test-model",
            timestamp: Date.now(),
            finishReason: "stop",
          };
        }
      }

      const adapter = new PendingToolAdapter();
      const aiInstance = ai(adapter);

      const messages: ModelMessage[] = [
        { role: "user", content: "Delete file" },
        {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "approval_tool",
                arguments: '{"path":"/tmp/test.txt"}',
              },
            },
          ],
          parts: [
            {
              type: "tool-call",
              id: "call-1",
              name: "approval_tool",
              arguments: '{"path":"/tmp/test.txt"}',
              state: "approval-responded",
              approval: {
                id: "approval_call-1",
                needsApproval: true,
                approved: true,
              },
            },
          ],
        } as any,
      ];

      const stream = aiInstance.chat({
        model: "test-model",
        messages,
        tools: [approvalTool],
      });

      const chunks = await collectChunks(stream);
      expect(chunks[0]?.type).toBe("tool_result");
      expect(toolExecute).toHaveBeenCalledWith({ path: "/tmp/test.txt" });
      expect(adapter.chatStreamCallCount).toBe(1);
    });
  });

  describe("Agent Loop Strategy Paths", () => {
    it("should respect custom agent loop strategy", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "test_tool", description: "Test", parameters: {} },
        execute: vi.fn(async () => JSON.stringify({ result: "ok" })),
      };

      class LoopAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          if (this.iteration < 3) {
            this.iteration++;
            yield {
              type: "tool_call",
              id: `test-id-${this.iteration}`,
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: `call-${this.iteration}`,
                type: "function",
                function: { name: "test_tool", arguments: "{}" },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: `test-id-${this.iteration}`,
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            yield {
              type: "content",
              id: `test-id-${this.iteration}`,
              model: "test-model",
              timestamp: Date.now(),
              delta: "Done",
              content: "Done",
              role: "assistant",
            };
            yield {
              type: "done",
              id: `test-id-${this.iteration}`,
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
          }
        }
      }

      const adapter = new LoopAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Loop" }],
          tools: [tool],
          agentLoopStrategy: ({ iterationCount }) => iterationCount < 2, // Max 2 iterations
        })
      );

      // Should stop after max iterations
      expect(adapter.chatStreamCallCount).toBeLessThanOrEqual(3);
    });

    it("should use default max iterations strategy (5)", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "test_tool", description: "Test", parameters: {} },
        execute: vi.fn(async () => JSON.stringify({ result: "ok" })),
      };

      class InfiniteLoopAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "tool_call",
            id: `test-id-${this.iteration}`,
            model: "test-model",
            timestamp: Date.now(),
            toolCall: {
              id: `call-${this.iteration}`,
              type: "function",
              function: { name: "test_tool", arguments: "{}" },
            },
            index: 0,
          };
          yield {
            type: "done",
            id: `test-id-${this.iteration}`,
            model: "test-model",
            timestamp: Date.now(),
            finishReason: "tool_calls",
          };
          this.iteration++;
        }
      }

      const adapter = new InfiniteLoopAdapter();
      const aiInstance = ai(adapter);

      // Consume stream - should stop after 5 iterations (default)
      const chunks: StreamChunk[] = [];
      for await (const chunk of aiInstance.chat({
        model: "test-model",
        messages: [{ role: "user", content: "Loop" }],
        tools: [tool],
        // No custom strategy - should use default maxIterations(5)
      })) {
        chunks.push(chunk);
        // Safety break
        if (chunks.length > 100) break;
      }

      // Should stop at max iterations (5) + 1 initial = 6 calls max
      expect(adapter.chatStreamCallCount).toBeLessThanOrEqual(6);
    });

    it("should exit loop when finishReason is not 'tool_calls'", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "test_tool", description: "Test", parameters: {} },
        execute: vi.fn(),
      };

      class StopAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "content",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            delta: "Hello",
            content: "Hello",
            role: "assistant",
          };
          yield {
            type: "done",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            finishReason: "stop", // Not tool_calls
          };
        }
      }

      const adapter = new StopAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Hello" }],
          tools: [tool],
        })
      );

      expect(tool.execute).not.toHaveBeenCalled();
      expect(adapter.chatStreamCallCount).toBe(1);
    });

    it("should exit loop when no tools provided", async () => {
      class NoToolsAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "tool_call",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            toolCall: {
              id: "call-1",
              type: "function",
              function: { name: "unknown_tool", arguments: "{}" },
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

      const adapter = new NoToolsAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
          // No tools provided
        })
      );

      // Should exit loop since no tools to execute
      expect(adapter.chatStreamCallCount).toBe(1);
    });

    it("should exit loop when toolCallManager has no tool calls", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "test_tool", description: "Test", parameters: {} },
        execute: vi.fn(),
      };

      class NoToolCallsAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          // Tool call with empty name (invalid)
          yield {
            type: "tool_call",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            toolCall: {
              id: "call-1",
              type: "function",
              function: { name: "", arguments: "{}" }, // Empty name
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

      const adapter = new NoToolCallsAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
          tools: [tool],
        })
      );

      // Should exit loop since no valid tool calls
      expect(tool.execute).not.toHaveBeenCalled();
      expect(adapter.chatStreamCallCount).toBe(1);
    });
  });

  describe("Abort Signal Paths", () => {
    it("should check abort signal before starting iteration", async () => {
      const adapter = new MockAdapter();
      const aiInstance = ai(adapter);

      const abortController = new AbortController();
      abortController.abort(); // Abort before starting

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Hello" }],
          abortController,
        })
      );

      // Should not yield any chunks if aborted before start
      expect(chunks.length).toBe(0);
      expect(adapter.chatStreamCallCount).toBe(0);
    });

    it("should check abort signal during streaming", async () => {
      class StreamingAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "content",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            delta: "Chunk 1",
            content: "Chunk 1",
            role: "assistant",
          };
          // Abort check happens in chat method between chunks
          yield {
            type: "content",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            delta: "Chunk 2",
            content: "Chunk 2",
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

      const adapter = new StreamingAdapter();
      const aiInstance = ai(adapter);

      const abortController = new AbortController();
      const stream = aiInstance.chat({
        model: "test-model",
        messages: [{ role: "user", content: "Hello" }],
        abortController,
      });

      const chunks: StreamChunk[] = [];
      let count = 0;

      for await (const chunk of stream) {
        chunks.push(chunk);
        count++;
        if (count === 1) {
          abortController.abort();
        }
      }

      // Should have at least one chunk before abort
      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should check abort signal before tool execution", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "test_tool", description: "Test", parameters: {} },
        execute: vi.fn(),
      };

      class ToolCallAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "tool_call",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            toolCall: {
              id: "call-1",
              type: "function",
              function: { name: "test_tool", arguments: "{}" },
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

      const adapter = new ToolCallAdapter();
      const aiInstance = ai(adapter);

      const abortController = new AbortController();
      const stream = aiInstance.chat({
        model: "test-model",
        messages: [{ role: "user", content: "Test" }],
        tools: [tool],
        abortController,
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
        if (chunk.type === "tool_call") {
          abortController.abort();
        }
      }

      // Should not execute tool if aborted
      expect(tool.execute).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling Paths", () => {
    it("should stop on error chunk and return early", async () => {
      class ErrorAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "content",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            delta: "Hello",
            content: "Hello",
            role: "assistant",
          };
          yield {
            type: "error",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            error: {
              message: "API error occurred",
              code: "API_ERROR",
            },
          };
          // These should never be yielded
          yield {
            type: "done",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            finishReason: "stop",
          } as any;
        }
      }

      const adapter = new ErrorAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Hello" }],
        })
      );

      // Should stop at error chunk
      expect(chunks).toHaveLength(2);
      expect(chunks[0].type).toBe("content");
      expect(chunks[1].type).toBe("error");
      expect((chunks[1] as any).error.message).toBe("API error occurred");

      // Should emit error event
      expect(capturedEvents.some((e) => e.type === "stream:chunk:error")).toBe(
        true
      );

      // Should NOT emit stream:ended after error
      const endedEvents = capturedEvents.filter(
        (e) => e.type === "stream:ended"
      );
      expect(endedEvents).toHaveLength(0);
    });
  });

  describe("Finish Reason Paths", () => {
    it("should handle finish reason 'stop'", async () => {
      class StopFinishAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "content",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            delta: "Done",
            content: "Done",
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

      const adapter = new StopFinishAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
        })
      );

      expect((chunks[1] as any).finishReason).toBe("stop");
      expect(adapter.chatStreamCallCount).toBe(1);
    });

    it("should handle finish reason 'length'", async () => {
      class LengthAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "content",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            delta: "Very long",
            content: "Very long",
            role: "assistant",
          };
          yield {
            type: "done",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            finishReason: "length",
          };
        }
      }

      const adapter = new LengthAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
        })
      );

      expect((chunks[1] as any).finishReason).toBe("length");
      expect(adapter.chatStreamCallCount).toBe(1);
    });

    it("should handle finish reason null", async () => {
      class NullFinishAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "content",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            delta: "Test",
            content: "Test",
            role: "assistant",
          };
          yield {
            type: "done",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            finishReason: null,
          };
        }
      }

      const adapter = new NullFinishAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
        })
      );

      expect(chunks.length).toBe(2);
      expect((chunks[1] as any).finishReason).toBeNull();
      expect(adapter.chatStreamCallCount).toBe(1);
    });
  });

  describe("Event Emission", () => {
    it("should emit all required events in correct order", async () => {
      const adapter = new MockAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Hello" }],
        })
      );

      const eventTypes = capturedEvents.map((e) => e.type);

      // Check event order and presence
      expect(eventTypes.includes("chat:started")).toBe(true);
      expect(eventTypes.includes("stream:started")).toBe(true);
      expect(eventTypes.includes("stream:chunk:content")).toBe(true);
      expect(eventTypes.includes("stream:chunk:done")).toBe(true);
      expect(eventTypes.includes("stream:ended")).toBe(true);

      // chat:started should come before stream:started
      const chatStartedIndex = eventTypes.indexOf("chat:started");
      const streamStartedIndex = eventTypes.indexOf("stream:started");
      expect(chatStartedIndex).toBeLessThan(streamStartedIndex);

      // stream:ended should come last
      const streamEndedIndex = eventTypes.indexOf("stream:ended");
      expect(streamEndedIndex).toBe(eventTypes.length - 1);
    });

    it("should emit iteration events for tool calls", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "test_tool", description: "Test", parameters: {} },
        execute: vi.fn(async () => JSON.stringify({ result: "ok" })),
      };

      class ToolAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          if (this.iteration === 0) {
            this.iteration++;
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: { name: "test_tool", arguments: "{}" },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            yield {
              type: "content",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Done",
              content: "Done",
              role: "assistant",
            };
            yield {
              type: "done",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
          }
        }
      }

      const adapter = new ToolAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
          tools: [tool],
        })
      );

      // Should emit chat:iteration event
      const iterationEvents = capturedEvents.filter(
        (e) => e.type === "chat:iteration"
      );
      expect(iterationEvents.length).toBeGreaterThan(0);
      expect(iterationEvents[0].data.iterationNumber).toBe(1);
    });

    it("should emit stream:ended event after successful completion", async () => {
      const adapter = new MockAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Hello" }],
        })
      );

      const endedEvent = capturedEvents.find((e) => e.type === "stream:ended");
      expect(endedEvent).toBeDefined();
      expect(endedEvent?.data.totalChunks).toBeGreaterThan(0);
      expect(endedEvent?.data.duration).toBeGreaterThanOrEqual(0);
    });

    it("should track total chunk count across iterations", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "test_tool", description: "Test", parameters: {} },
        execute: vi.fn(async () => JSON.stringify({ result: "ok" })),
      };

      class MultiIterationAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          if (this.iteration === 0) {
            this.iteration++;
            yield {
              type: "content",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Let me",
              content: "Let me",
              role: "assistant",
            };
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: { name: "test_tool", arguments: "{}" },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            yield {
              type: "content",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Done",
              content: "Done",
              role: "assistant",
            };
            yield {
              type: "done",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
          }
        }
      }

      const adapter = new MultiIterationAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
          tools: [tool],
        })
      );

      const endedEvent = capturedEvents.find((e) => e.type === "stream:ended");
      expect(endedEvent).toBeDefined();
      // Should count: 3 chunks from iteration 1 + 2 chunks from iteration 2 + 1 tool_result = 6
      expect(endedEvent?.data.totalChunks).toBeGreaterThanOrEqual(4);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty messages array", async () => {
      const adapter = new MockAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [],
        })
      );

      expect(chunks.length).toBeGreaterThan(0);
      expect(adapter.chatStreamCalls[0].messages).toHaveLength(0);
    });

    it("should handle empty tools array", async () => {
      const adapter = new MockAdapter();
      const aiInstance = ai(adapter);

      const chunks = await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Hello" }],
          tools: [],
        })
      );

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should handle tool calls with missing ID", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "test_tool", description: "Test", parameters: {} },
        execute: vi.fn(),
      };

      class MissingIdAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "tool_call",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            toolCall: {
              id: "", // Empty ID
              type: "function",
              function: { name: "test_tool", arguments: "{}" },
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

      const adapter = new MissingIdAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Test" }],
          tools: [tool],
        })
      );

      // Tool should not be executed (invalid tool call)
      expect(tool.execute).not.toHaveBeenCalled();
    });

    it("should handle tool call with invalid JSON arguments", async () => {
      const tool: Tool = {
        type: "function",
        function: { name: "test_tool", description: "Test", parameters: {} },
        execute: vi.fn(),
      };

      class InvalidJsonAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "tool_call",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            toolCall: {
              id: "call-1",
              type: "function",
              function: { name: "test_tool", arguments: "invalid json{" },
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

      const adapter = new InvalidJsonAdapter();
      const aiInstance = ai(adapter);

      // The executor will throw when parsing invalid JSON
      // This will cause an unhandled error, but we can test that it throws
      await expect(
        collectChunks(
          aiInstance.chat({
            model: "test-model",
            messages: [{ role: "user", content: "Test" }],
            tools: [tool],
          })
        )
      ).rejects.toThrow(); // Should throw due to JSON parse error in executor
    });
  });

  describe("Tool Result Chunk Events from Adapter", () => {
    it("should emit stream:chunk:tool-result event when adapter sends tool_result chunk", async () => {
      class ToolResultChunkAdapter extends MockAdapter {
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          yield {
            type: "content",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            delta: "Using tool",
            content: "Using tool",
            role: "assistant",
          };
          // Adapter sends tool_result chunk directly (from previous execution)
          yield {
            type: "tool_result",
            id: "test-id",
            model: "test-model",
            timestamp: Date.now(),
            toolCallId: "call-previous",
            content: JSON.stringify({ result: "previous result" }),
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

      const adapter = new ToolResultChunkAdapter();
      const aiInstance = ai(adapter);

      await collectChunks(
        aiInstance.chat({
          model: "test-model",
          messages: [{ role: "user", content: "Continue" }],
        })
      );

      // Should emit tool-result event for the tool_result chunk from adapter
      const toolResultEvents = capturedEvents.filter(
        (e) => e.type === "stream:chunk:tool-result"
      );
      expect(toolResultEvents.length).toBeGreaterThan(0);
      expect(toolResultEvents[0].data.toolCallId).toBe("call-previous");
      expect(toolResultEvents[0].data.result).toBe(
        JSON.stringify({ result: "previous result" })
      );
    });
  });

  describe("Extract Approvals and Client Tool Results from Messages", () => {
    it("should extract approval responses from messages with parts", async () => {
      const tool: Tool = {
        type: "function",
        function: {
          name: "delete_file",
          description: "Delete file",
          parameters: {},
        },
        needsApproval: true,
        execute: vi.fn(async () => JSON.stringify({ success: true })),
      };

      class ApprovalResponseAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);

          // Check if messages have approval response in parts
          const hasApprovalResponse = options.messages.some((msg) => {
            if (msg.role === "assistant" && (msg as any).parts) {
              const parts = (msg as any).parts;
              return parts.some(
                (p: any) =>
                  p.type === "tool-call" &&
                  p.state === "approval-responded" &&
                  p.approval?.approved === true
              );
            }
            return false;
          });

          if (hasApprovalResponse) {
            // Messages have approval response - yield tool_calls again to trigger execution
            // The approval will be extracted from parts and tool will be executed
            yield {
              type: "tool_call",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: {
                  name: "delete_file",
                  arguments: '{"path":"/tmp/test.txt"}',
                },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            // First iteration: request approval
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: {
                  name: "delete_file",
                  arguments: '{"path":"/tmp/test.txt"}',
                },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          }
        }
      }

      const adapter = new ApprovalResponseAdapter();
      const aiInstance = ai(adapter);

      // First call - should request approval
      const stream1 = aiInstance.chat({
        model: "test-model",
        messages: [{ role: "user", content: "Delete file" }],
        tools: [tool],
      });

      const chunks1 = await collectChunks(stream1);
      const approvalChunk = chunks1.find(
        (c) => c.type === "approval-requested"
      );
      expect(approvalChunk).toBeDefined();

      // Second call - with approval response in message parts
      // The approval ID should match the format: approval_${toolCall.id}
      const messagesWithApproval: ModelMessage[] = [
        { role: "user", content: "Delete file" },
        {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "delete_file",
                arguments: '{"path":"/tmp/test.txt"}',
              },
            },
          ],
          parts: [
            {
              type: "tool-call",
              id: "call-1",
              name: "delete_file",
              arguments: '{"path":"/tmp/test.txt"}',
              state: "approval-responded",
              approval: {
                id: "approval_call-1", // Format: approval_${toolCall.id}
                needsApproval: true,
                approved: true, // User approved
              },
            },
          ],
        } as any,
      ];

      const stream2 = aiInstance.chat({
        model: "test-model",
        messages: messagesWithApproval,
        tools: [tool],
      });

      await collectChunks(stream2);

      // Tool should have been executed because approval was provided
      expect(tool.execute).toHaveBeenCalledWith({ path: "/tmp/test.txt" });
    });

    it("should extract client tool outputs from messages with parts", async () => {
      const tool: Tool = {
        type: "function",
        function: {
          name: "client_tool",
          description: "Client tool",
          parameters: {},
        },
        // No execute - client-side tool
      };

      class ClientOutputAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);

          if (this.iteration === 0) {
            this.iteration++;
            // First iteration: request client execution
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: {
                  name: "client_tool",
                  arguments: '{"input":"test"}',
                },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            // Second iteration: should have client tool output in parts
            yield {
              type: "content",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Received result",
              content: "Received result",
              role: "assistant",
            };
            yield {
              type: "done",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
          }
        }
      }

      const adapter = new ClientOutputAdapter();
      const aiInstance = ai(adapter);

      // First call - should request client execution
      const stream1 = aiInstance.chat({
        model: "test-model",
        messages: [{ role: "user", content: "Use client tool" }],
        tools: [tool],
      });

      const chunks1 = await collectChunks(stream1);
      const inputChunk = chunks1.find((c) => c.type === "tool-input-available");
      expect(inputChunk).toBeDefined();

      // Second call - with client tool output in message parts
      const messagesWithOutput: ModelMessage[] = [
        { role: "user", content: "Use client tool" },
        {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "client_tool",
                arguments: '{"input":"test"}',
              },
            },
          ],
          parts: [
            {
              type: "tool-call",
              id: "call-1",
              name: "client_tool",
              arguments: '{"input":"test"}',
              state: "complete",
              output: { result: "client executed", value: 42 }, // Client tool output
            },
          ],
        } as any,
      ];

      const stream2 = aiInstance.chat({
        model: "test-model",
        messages: messagesWithOutput,
        tools: [tool],
      });

      await collectChunks(stream2);

      // Should continue to next iteration (tool result extracted from parts)
      expect(adapter.chatStreamCallCount).toBeGreaterThan(1);
    });

    it("should handle messages with both approval and client tool parts", async () => {
      const approvalTool: Tool = {
        type: "function",
        function: {
          name: "approval_tool",
          description: "Approval",
          parameters: {},
        },
        needsApproval: true,
        execute: vi.fn(async () => JSON.stringify({ success: true })),
      };

      const clientTool: Tool = {
        type: "function",
        function: {
          name: "client_tool",
          description: "Client",
          parameters: {},
        },
        // No execute
      };

      class MixedPartsAdapter extends MockAdapter {
        iteration = 0;
        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          if (this.iteration === 0) {
            this.iteration++;
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-1",
                type: "function",
                function: { name: "approval_tool", arguments: "{}" },
              },
              index: 0,
            };
            yield {
              type: "tool_call",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "call-2",
                type: "function",
                function: { name: "client_tool", arguments: '{"x":1}' },
              },
              index: 1,
            };
            yield {
              type: "done",
              id: "test-id-1",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
            };
          } else {
            yield {
              type: "content",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              delta: "Done",
              content: "Done",
              role: "assistant",
            };
            yield {
              type: "done",
              id: "test-id-2",
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
          }
        }
      }

      const adapter = new MixedPartsAdapter();
      const aiInstance = ai(adapter);

      // Call with messages containing both approval response and client tool output in parts
      const messagesWithBoth: ModelMessage[] = [
        { role: "user", content: "Use both tools" },
        {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "approval_tool", arguments: "{}" },
            },
            {
              id: "call-2",
              type: "function",
              function: { name: "client_tool", arguments: '{"x":1}' },
            },
          ],
          parts: [
            {
              type: "tool-call",
              id: "call-1",
              name: "approval_tool",
              arguments: "{}",
              state: "approval-responded",
              approval: {
                id: "approval_call-1",
                needsApproval: true,
                approved: true,
              },
            },
            {
              type: "tool-call",
              id: "call-2",
              name: "client_tool",
              arguments: '{"x":1}',
              state: "complete",
              output: { result: "client result" },
            },
          ],
        } as any,
      ];

      const stream = aiInstance.chat({
        model: "test-model",
        messages: messagesWithBoth,
        tools: [approvalTool, clientTool],
      });

      await collectChunks(stream);

      // Approval tool should be executed (approval was provided)
      expect(approvalTool.execute).toHaveBeenCalled();
      // Should continue with tool results from parts
      expect(adapter.chatStreamCallCount).toBeGreaterThan(1);
    });
  });

  describe("Temperature Tool Test - Debugging Tool Execution", () => {
    it("should execute tool and continue loop when receiving tool_calls finishReason with maxIterations(20)", async () => {
      // Create a tool that returns "70" like the failing test
      const temperatureTool: Tool = {
        type: "function",
        function: {
          name: "get_temperature",
          description: "Get the current temperature in degrees",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
        execute: vi.fn(async (args: any) => {
          return "70";
        }),
      };

      // Create adapter that mimics the failing test output
      class TemperatureToolAdapter extends MockAdapter {
        iteration = 0;

        async *chatStream(
          options: ChatCompletionOptions
        ): AsyncIterable<StreamChunk> {
          this.trackStreamCall(options);
          const baseId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

          if (this.iteration === 0) {
            // First iteration: emit content chunks, tool_call, then done with tool_calls
            yield {
              type: "content",
              id: baseId,
              model: "test-model",
              timestamp: Date.now(),
              delta: "I",
              content: "I",
              role: "assistant",
            };
            yield {
              type: "content",
              id: baseId,
              model: "test-model",
              timestamp: Date.now(),
              delta: "'ll help you check the current temperature right away.",
              content:
                "I'll help you check the current temperature right away.",
              role: "assistant",
            };
            yield {
              type: "tool_call",
              id: baseId,
              model: "test-model",
              timestamp: Date.now(),
              toolCall: {
                id: "toolu_01D28jUnxcHQ5qqewJ7X6p1K",
                type: "function",
                function: {
                  name: "get_temperature",
                  // Empty string like in the actual failing test - should be handled gracefully
                  arguments: "",
                },
              },
              index: 0,
            };
            yield {
              type: "done",
              id: baseId,
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "tool_calls",
              usage: {
                promptTokens: 0,
                completionTokens: 48,
                totalTokens: 48,
              },
            };
            this.iteration++;
          } else {
            // Second iteration: should receive tool result and respond with "70"
            // This simulates what should happen after tool execution
            const toolResults = options.messages.filter(
              (m) => m.role === "tool"
            );
            expect(toolResults.length).toBeGreaterThan(0);
            expect(toolResults[0].content).toBe("70");

            yield {
              type: "content",
              id: `${baseId}-2`,
              model: "test-model",
              timestamp: Date.now(),
              delta: "The current temperature is 70 degrees.",
              content: "The current temperature is 70 degrees.",
              role: "assistant",
            };
            yield {
              type: "done",
              id: `${baseId}-2`,
              model: "test-model",
              timestamp: Date.now(),
              finishReason: "stop",
            };
            this.iteration++;
          }
        }
      }

      const adapter = new TemperatureToolAdapter();
      const aiInstance = ai(adapter);

      const stream = aiInstance.chat({
        model: "test-model",
        messages: [{ role: "user", content: "what is the temperature?" }],
        tools: [temperatureTool],
        agentLoopStrategy: maxIterations(20),
      });

      const chunks = await collectChunks(stream);

      // Debug: log what we got
      console.log("\n=== DEBUG: Temperature Tool Test ===");
      console.log("Total chunks:", chunks.length);
      console.log("Chunk types:", chunks.map((c) => c.type));
      console.log("Tool execute called:", temperatureTool.execute?.mock.calls.length);
      console.log("Adapter iterations:", adapter.chatStreamCallCount);
      
      const toolCallChunks = chunks.filter((c) => c.type === "tool_call");
      const toolResultChunks = chunks.filter((c) => c.type === "tool_result");
      const doneChunks = chunks.filter((c) => c.type === "done");
      
      console.log("Tool call chunks:", toolCallChunks.length);
      console.log("Tool result chunks:", toolResultChunks.length);
      console.log("Done chunks:", doneChunks.map((c) => (c as any).finishReason));
      console.log("===============================\n");

      // We should have received tool_call chunks
      expect(toolCallChunks.length).toBeGreaterThan(0);

      // The tool should have been executed
      expect(temperatureTool.execute).toHaveBeenCalled();

      // We should have tool_result chunks
      expect(toolResultChunks.length).toBeGreaterThan(0);

      // The adapter should have been called multiple times (at least 2: initial + after tool execution)
      expect(adapter.chatStreamCallCount).toBeGreaterThanOrEqual(2);

      // We should have at least one content chunk with "70" in it
      const contentChunks = chunks.filter((c) => c.type === "content");
      const hasSeventy = contentChunks.some((c) =>
        (c as any).content?.toLowerCase().includes("70")
      );
      expect(hasSeventy).toBe(true);
    });
  });
});
