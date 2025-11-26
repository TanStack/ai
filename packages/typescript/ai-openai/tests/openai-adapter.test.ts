import { describe, it, expect, beforeEach, vi } from "vitest";
import { chat, type Tool, type StreamChunk } from "@tanstack/ai";
import { OpenAI, type OpenAIProviderOptions } from "../src/openai-adapter";

const createAdapter = () => new OpenAI({ apiKey: "test-key" });

const toolArguments = JSON.stringify({ location: "Berlin" });

const weatherTool: Tool = {
  type: "function",
  function: {
    name: "lookup_weather",
    description: "Return the forecast for a location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string" },
      },
      required: ["location"],
    },
  },
};

function createMockChatCompletionsStream(
  chunks: Array<Record<string, unknown>>
): AsyncIterable<Record<string, unknown>> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

describe("OpenAI adapter option mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps options into the Chat Completions payload", async () => {
    const mockStream = createMockChatCompletionsStream([
      {
        id: "chatcmpl-123",
        object: "chat.completion.chunk",
        created: 1234567890,
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            delta: { content: "It is sunny" },
            finish_reason: null,
          },
        ],
      },
      {
        id: "chatcmpl-123",
        object: "chat.completion.chunk",
        created: 1234567891,
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 4,
          total_tokens: 16,
        },
      },
    ]);

    const chatCompletionsCreate = vi.fn().mockResolvedValueOnce(mockStream);

    const adapter = createAdapter();
    // Replace the internal OpenAI SDK client with our mock
    (adapter as any).client = {
      chat: {
        completions: {
          create: chatCompletionsCreate,
        },
      },
    };

    const providerOptions: OpenAIProviderOptions = {
      tool_choice: "required",
    };

    const chunks: StreamChunk[] = [];
    for await (const chunk of chat({
      adapter,
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Stay concise" },
        { role: "user", content: "How is the weather?" },
        {
          role: "assistant",
          content: "Let me check",
          toolCalls: [
            {
              id: "call_weather",
              type: "function",
              function: { name: "lookup_weather", arguments: toolArguments },
            },
          ],
        },
        { role: "tool", toolCallId: "call_weather", content: '{"temp":72}' },
      ],
      tools: [weatherTool],
      options: {
        temperature: 0.25,
        topP: 0.6,
        maxTokens: 1024,
        metadata: { requestId: "req-42" },
      },
      providerOptions,
    })) {
      chunks.push(chunk);
    }

    expect(chatCompletionsCreate).toHaveBeenCalledTimes(1);
    const [payload] = chatCompletionsCreate.mock.calls[0];

    expect(payload).toMatchObject({
      model: "gpt-4o-mini",
      temperature: 0.25,
      top_p: 0.6,
      max_tokens: 1024,
      stream: true,
      tools: [
        {
          type: "function",
          function: {
            name: "lookup_weather",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string" },
              },
              required: ["location"],
            },
          },
        },
      ],
    });

    expect(payload.messages).toEqual([
      {
        role: "system",
        content: "Stay concise",
      },
      {
        role: "user",
        content: "How is the weather?",
      },
      {
        role: "assistant",
        content: "Let me check",
        tool_calls: [
          {
            id: "call_weather",
            type: "function",
            function: {
              name: "lookup_weather",
              arguments: toolArguments,
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_weather",
        content: '{"temp":72}',
      },
    ]);
  });
});
