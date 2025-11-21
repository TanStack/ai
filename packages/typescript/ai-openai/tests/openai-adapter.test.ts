import { describe, it, expect, beforeEach, vi } from "vitest";
import { ai, type Tool } from "@tanstack/ai";
import { OpenAI, type OpenAIProviderOptions } from "../src/openai-adapter";

const mocks = vi.hoisted(() => {
  const responsesCreate = vi.fn();
  const chatCompletionsCreate = vi.fn();
  const embeddingsCreate = vi.fn();
  const imagesGenerate = vi.fn();
  const audioTranscriptionsCreate = vi.fn();
  const audioSpeechCreate = vi.fn(async () => ({
    arrayBuffer: async () => new ArrayBuffer(0),
  }));
  const videosCreate = vi.fn();
  const videosRemix = vi.fn();

  const client = {
    responses: { create: responsesCreate },
    chat: { completions: { create: chatCompletionsCreate } },
    embeddings: { create: embeddingsCreate },
    images: { generate: imagesGenerate },
    audio: {
      transcriptions: { create: audioTranscriptionsCreate },
      speech: { create: audioSpeechCreate },
    },
    videos: { create: videosCreate, remix: videosRemix },
  };

  return {
    responsesCreate,
    chatCompletionsCreate,
    embeddingsCreate,
    imagesGenerate,
    audioTranscriptionsCreate,
    audioSpeechCreate,
    videosCreate,
    videosRemix,
    client,
  };
});

vi.mock("openai", () => {
  const { client } = mocks;

  class MockOpenAI {
    responses = client.responses;
    chat = client.chat;
    embeddings = client.embeddings;
    images = client.images;
    audio = client.audio;
    videos = client.videos;

    constructor(_: { apiKey: string }) { }
  }

  return { default: MockOpenAI };
});

const createAI = () => ai(new OpenAI({ apiKey: "test-key" }));

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

describe("OpenAI adapter option mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps common and provider options into the Responses payload", async () => {
    mocks.responsesCreate.mockResolvedValueOnce({
      id: "resp_123",
      model: "gpt-4o-mini",
      output: [
        {
          type: "message",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: "It is sunny",
            },
          ],
        },
      ],
      usage: {
        input_tokens: 12,
        output_tokens: 4,
        total_tokens: 16,
      },
    });

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

    const aiInstance = createAI();

    await aiInstance.chatCompletion({
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
    });

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
    expect(payload.stream).toBe(false);

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
