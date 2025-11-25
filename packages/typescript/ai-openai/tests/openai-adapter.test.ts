import { describe, it, expect, beforeEach, vi } from "vitest";
import { chat, type Tool, type StreamChunk } from "@tanstack/ai";
import { OpenAI, type OpenAIProviderOptions } from "../src/openai-adapter";

const mocks = vi.hoisted(() => ({
  responsesCreate: vi.fn(),
}));

vi.mock("openai", () => {
  const { responsesCreate } = mocks;

  class MockOpenAI {
    public responses = { create: responsesCreate };
    constructor(_: { apiKey: string }) { }
  }

  return { default: MockOpenAI };
});

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

// Helper to create a ReadableStream from JSON lines
function createMockResponseStream(events: Array<Record<string, unknown>>): { toReadableStream: () => ReadableStream<Uint8Array> } {
  return {
    toReadableStream: () => {
      const encoder = new TextEncoder();
      const lines = events.map((e) => JSON.stringify(e) + "\n");
      let index = 0;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (index < lines.length) {
            controller.enqueue(encoder.encode(lines[index]!));
            index++;
          } else {
            controller.close();
          }
        },
      });
    },
  };
}

describe("OpenAI adapter option mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps common and provider options into the Responses payload", async () => {
    // Mock streaming response
    const mockResponse = createMockResponseStream([
      {
        type: "response.output_item.added",
        item: {
          type: "message",
          role: "assistant",
          content: [],
        },
      },
      {
        type: "response.content_part.added",
        part: { type: "text", text: "" },
      },
      {
        type: "response.output_text.delta",
        delta: "It is sunny",
      },
      {
        type: "response.completed",
        response: {
          id: "resp_123",
          status: "completed",
          usage: {
            input_tokens: 12,
            output_tokens: 4,
            total_tokens: 16,
          },
        },
      },
    ]);

    mocks.responsesCreate.mockResolvedValueOnce(mockResponse);

    const providerOptions: OpenAIProviderOptions = {
      background: true,
      conversation: { id: "conv_123" },
      include: ["message.output_text.logprobs"],
      max_tool_calls: 4,
      parallel_tool_calls: false,
      prompt: {
        id: "prompt_weather",
        version: "3",
        variables: { location: "Berlin" },
      },
      prompt_cache_key: "weather-cache",
      prompt_cache_retention: "24h",
      reasoning: { effort: "medium" },
      summary: "detailed",
      safety_identifier: "user-42",
      service_tier: "priority",
      store: false,
      stream_options: { include_obfuscation: false },
      top_logprobs: 5,
      truncation: "auto",
      tool_choice: "required",
      verbosity: "high",
    };

    const adapter = createAdapter();

    // Consume the stream to trigger the API call
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
        { role: "tool", toolCallId: "call_weather", content: "{\"temp\":72}" },
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

    expect(mocks.responsesCreate).toHaveBeenCalledTimes(1);
    const [payload] = mocks.responsesCreate.mock.calls[0];

    expect(payload).toMatchObject({
      model: "gpt-4o-mini",
      temperature: 0.25,
      top_p: 0.6,
      max_output_tokens: 1024,
      metadata: { requestId: "req-42" },
      ...providerOptions,
    });
    expect(payload.stream).toBe(true);

    expect(payload.input).toEqual([
      {
        type: "message",
        role: "system",
        content: [{ type: "input_text", text: "Stay concise" }],
      },
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "How is the weather?" }],
      },
      {
        type: "function_call",
        call_id: "call_weather",
        name: "lookup_weather",
        arguments: toolArguments,
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "input_text", text: "Let me check" }],
      },
      {
        type: "function_call_output",
        call_id: "call_weather",
        output: "{\"temp\":72}",
      },
    ]);

    expect(payload.tools?.[0]).toMatchObject({
      type: "function",
      name: "lookup_weather",
    });
  });
});
