import { describe, it, expect, beforeEach, vi } from "vitest";
import { chat, type Tool, type StreamChunk } from "@tanstack/ai";
import { Anthropic, type AnthropicProviderOptions } from "../src/anthropic-adapter";

const mocks = vi.hoisted(() => {
  const betaMessagesCreate = vi.fn();
  const messagesCreate = vi.fn();

  const client = {
    beta: {
      messages: {
        create: betaMessagesCreate,
      },
    },
    messages: {
      create: messagesCreate,
    },
  };

  return { betaMessagesCreate, messagesCreate, client };
});

vi.mock("@anthropic-ai/sdk", () => {
  const { client } = mocks;

  class MockAnthropic {
    beta = client.beta;
    messages = client.messages;

    constructor(_: { apiKey: string }) { }
  }

  return { default: MockAnthropic };
});

const createAdapter = () => new Anthropic({ apiKey: "test-key" });

const toolArguments = JSON.stringify({ location: "Berlin" });

const weatherTool: Tool = {
  type: "function",
  function: {
    name: "lookup_weather",
    description: "Return the weather for a city",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string" },
      },
      required: ["location"],
    },
  },
};

describe("Anthropic adapter option mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps normalized options and Anthropic provider settings", async () => {
    // Mock the streaming response
    const mockStream = (async function* () {
      yield {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      };
      yield {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "It will be sunny" },
      };
      yield {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 5 },
      };
      yield {
        type: "message_stop",
      };
    })();

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream);

    const providerOptions = {
      container: {
        id: "container-weather",
        skills: [{ skill_id: "forecast", type: "custom", version: "1" }],
      },
      mcp_servers: [
        {
          name: "world-weather",
          url: "https://mcp.example.com",
          type: "url",
          authorization_token: "secret",
          tool_configuration: {
            allowed_tools: ["lookup_weather"],
            enabled: true,
          },
        },
      ],
      service_tier: "standard_only",
      stop_sequences: ["</done>"],
      thinking: { type: "enabled", budget_tokens: 1500 },
      top_k: 5,
      system: "Respond with JSON",
    } satisfies AnthropicProviderOptions & { system: string };

    const adapter = createAdapter();

    // Consume the stream to trigger the API call
    const chunks: StreamChunk[] = [];
    for await (const chunk of chat({
      adapter,
      model: "claude-3-7-sonnet-20250219",
      messages: [
        { role: "system", content: "Keep it structured" },
        { role: "user", content: "What is the forecast?" },
        {
          role: "assistant",
          content: "Checking",
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
        maxTokens: 3000,
        temperature: 0.4,
        topP: 0.8,
      },
      providerOptions,
    })) {
      chunks.push(chunk);
    }

    expect(mocks.betaMessagesCreate).toHaveBeenCalledTimes(1);
    const [payload] = mocks.betaMessagesCreate.mock.calls[0];

    expect(payload).toMatchObject({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 3000,
      temperature: 0.4,
      top_p: 0.8,
      container: providerOptions.container,
      mcp_servers: providerOptions.mcp_servers,
      service_tier: providerOptions.service_tier,
      stop_sequences: providerOptions.stop_sequences,
      thinking: providerOptions.thinking,
      top_k: providerOptions.top_k,
      system: providerOptions.system,
    });
    expect(payload.stream).toBe(true);

    expect(payload.messages).toEqual([
      {
        role: "user",
        content: "What is the forecast?",
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Checking" },
          {
            type: "tool_use",
            id: "call_weather",
            name: "lookup_weather",
            input: { location: "Berlin" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_weather",
            content: "{\"temp\":72}",
          },
        ],
      },
    ]);

    expect(payload.tools?.[0]).toMatchObject({
      name: "lookup_weather",
      type: "custom",
    });
  });
});
