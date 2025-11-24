import { describe, it, expect, beforeEach, vi } from "vitest";
import { ai } from "@tanstack/ai";
import type { Tool, StreamChunk } from "@tanstack/ai";
import type { HarmBlockThreshold, HarmCategory, SafetySetting } from "@google/genai";
import type { Schema } from "../src/tools/function-declaration-tool";
import { GeminiAdapter, type GeminiProviderOptions } from "../src/gemini-adapter";

const mocks = vi.hoisted(() => {
  return {
    constructorSpy: vi.fn<(options: { apiKey: string }) => void>(),
    generateContentSpy: vi.fn(),
    generateContentStreamSpy: vi.fn(),
    getGenerativeModelSpy: vi.fn(),
  };
});

vi.mock("@google/genai", () => {
  const { constructorSpy, generateContentSpy, generateContentStreamSpy, getGenerativeModelSpy } = mocks;

  class MockGoogleGenAI {
    public models = {
      generateContent: generateContentSpy,
      generateContentStream: generateContentStreamSpy,
    };

    public getGenerativeModel = getGenerativeModelSpy;

    constructor(options: { apiKey: string }) {
      constructorSpy(options);
    }
  }

  return { GoogleGenAI: MockGoogleGenAI };
});

const createAI = () => ai(new GeminiAdapter({ apiKey: "test-key" }));

const weatherTool: Tool = {
  type: "function",
  function: {
    name: "lookup_weather",
    description: "Return the weather for a location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string" },
      },
      required: ["location"],
    },
  },
};

const createStream = (chunks: Array<Record<string, unknown>>) => {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
};

describe("GeminiAdapter through AI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps provider options for chatCompletion", async () => {
    mocks.generateContentSpy.mockResolvedValue({
      data: "Sunny skies ahead",
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: {
        promptTokenCount: 3,
        thoughtsTokenCount: 1,
        totalTokenCount: 4,
      },
    });

    const aiInstance = createAI();

    await aiInstance.chatCompletion({
      model: "gemini-2.5-pro",
      messages: [{ role: "user", content: "How is the weather in Madrid?" }],
      providerOptions: {
        generationConfig: { topK: 9 },
      },
      options: {
        temperature: 0.4,
        topP: 0.8,
        maxTokens: 256,
      },
      tools: [weatherTool],
    });

    expect(mocks.generateContentSpy).toHaveBeenCalledTimes(1);
    const [payload] = mocks.generateContentSpy.mock.calls[0];
    expect(payload.model).toBe("gemini-2.5-pro");
    expect(payload.config).toMatchObject({
      temperature: 0.4,
      topP: 0.8,
      maxOutputTokens: 256,
      topK: 9,
    });
    expect(payload.config?.tools?.[0]?.functionDeclarations?.[0]?.name).toBe(
      "lookup_weather",
    );
    expect(payload.contents).toEqual([
      {
        role: "user",
        parts: [{ text: "How is the weather in Madrid?" }],
      },
    ]);
  });

  it("maps every common and provider option into the Gemini payload", async () => {
    mocks.generateContentSpy.mockResolvedValue({
      data: "",
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: undefined,
    });

    const safetySettings: SafetySetting[] = [
      {
        category: "HARM_CATEGORY_HATE_SPEECH" as HarmCategory,
        threshold: "BLOCK_LOW_AND_ABOVE" as HarmBlockThreshold,
      },
    ];

    const responseSchema: Schema = {
      type: "OBJECT",
      properties: {
        summary: { type: "STRING" },
      },
    };

    const responseJsonSchema: Schema = {
      type: "OBJECT",
      properties: {
        ok: { type: "BOOLEAN" },
      },
    };

    const providerOptions: GeminiProviderOptions = {
      safetySettings,
      generationConfig: {
        stopSequences: ["<done>", "###"],
        responseMimeType: "application/json",
        responseSchema,
        responseJsonSchema,
        responseModalities: ["TEXT"],
        candidateCount: 2,
        topK: 6,
        seed: 7,
        presencePenalty: 0.2,
        frequencyPenalty: 0.4,
        responseLogprobs: true,
        logprobs: 3,
        enableEnhancedCivicAnswers: true,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Studio",
            },
          },
        },
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 128,
        },
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
      cachedContent: "cachedContents/weather-context",
    };

    const aiInstance = createAI();

    await aiInstance.chatCompletion({
      model: "gemini-2.5-pro",
      messages: [{ role: "user", content: "Provide structured response" }],
      options: {
        temperature: 0.61,
        topP: 0.37,
        maxTokens: 512,
      },
      systemPrompts: ["Stay concise", "Return JSON"],
      providerOptions,
    });

    expect(mocks.generateContentSpy).toHaveBeenCalledTimes(1);
    const [payload] = mocks.generateContentSpy.mock.calls[0];
    const config = payload.config;

    expect(config.temperature).toBe(0.61);
    expect(config.topP).toBe(0.37);
    expect(config.maxOutputTokens).toBe(512);
    expect(config.cachedContent).toBe(providerOptions.cachedContent);
    expect(config.safetySettings).toEqual(providerOptions.safetySettings);
    expect(config.generationConfig).toEqual(providerOptions.generationConfig);
    expect(config.stopSequences).toEqual(providerOptions.generationConfig?.stopSequences);
    expect(config.responseMimeType).toBe(providerOptions.generationConfig?.responseMimeType);
    expect(config.responseSchema).toEqual(providerOptions.generationConfig?.responseSchema);
    expect(config.responseJsonSchema).toEqual(providerOptions.generationConfig?.responseJsonSchema);
    expect(config.responseModalities).toEqual(providerOptions.generationConfig?.responseModalities);
    expect(config.candidateCount).toBe(providerOptions.generationConfig?.candidateCount);
    expect(config.topK).toBe(providerOptions.generationConfig?.topK);
    expect(config.seed).toBe(providerOptions.generationConfig?.seed);
    expect(config.presencePenalty).toBe(providerOptions.generationConfig?.presencePenalty);
    expect(config.frequencyPenalty).toBe(providerOptions.generationConfig?.frequencyPenalty);
    expect(config.responseLogprobs).toBe(providerOptions.generationConfig?.responseLogprobs);
    expect(config.logprobs).toBe(providerOptions.generationConfig?.logprobs);
    expect(config.enableEnhancedCivicAnswers).toBe(
      providerOptions.generationConfig?.enableEnhancedCivicAnswers,
    );
    expect(config.speechConfig).toEqual(providerOptions.generationConfig?.speechConfig);
    expect(config.thinkingConfig).toEqual(providerOptions.generationConfig?.thinkingConfig);
    expect(config.imageConfig).toEqual(providerOptions.generationConfig?.imageConfig);
  });

  it("streams chat chunks using mapped provider config", async () => {
    const streamChunks = [
      {
        candidates: [
          {
            content: {
              parts: [{ text: "Partly " }],
            },
          },
        ],
      },
      {
        candidates: [
          {
            content: {
              parts: [{ text: "cloudy" }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 4,
          thoughtsTokenCount: 2,
          totalTokenCount: 6,
        },
      },
    ];

    mocks.generateContentStreamSpy.mockResolvedValue(createStream(streamChunks));

    const aiInstance = createAI();
    const received: StreamChunk[] = [];
    for await (const chunk of aiInstance.chat({
      model: "gemini-2.5-pro",
      messages: [{ role: "user", content: "Tell me a joke" }],
      providerOptions: {
        generationConfig: { topK: 3 },
      },
      options: { temperature: 0.2 },
    })) {
      received.push(chunk);
    }

    expect(mocks.generateContentStreamSpy).toHaveBeenCalledTimes(1);
    const [streamPayload] = mocks.generateContentStreamSpy.mock.calls[0];
    expect(streamPayload.config?.topK).toBe(3);
    expect(received[0]).toMatchObject({
      type: "content",
      delta: "Partly ",
      content: "Partly ",
    });
    expect(received[1]).toMatchObject({
      type: "content",
      delta: "cloudy",
      content: "Partly cloudy",
    });
    expect(received.at(-1)).toMatchObject({
      type: "done",
      finishReason: "stop",
      usage: {
        promptTokens: 4,
        completionTokens: 2,
        totalTokens: 6,
      },
    });
  });

  it("uses getGenerativeModel for summarize", async () => {
    const summaryText = "Short and sweet.";
    const generativeModel = {
      generateContent: vi.fn().mockResolvedValue({
        response: Promise.resolve({
          text: () => summaryText,
        }),
      }),
      embedContent: vi.fn(),
    };
    mocks.getGenerativeModelSpy.mockReturnValueOnce(generativeModel);

    const aiInstance = createAI();
    const result = await aiInstance.summarize({
      model: "gemini-2.5-flash",
      text: "A very long passage that needs to be shortened",
      maxLength: 123,
      style: "paragraph",
    });

    expect(mocks.getGenerativeModelSpy).toHaveBeenCalledWith({
      model: "gemini-2.5-flash",
      config: {
        temperature: 0.3,
        maxOutputTokens: 123,
      },
    });
    expect(generativeModel.generateContent).toHaveBeenCalledTimes(1);
    expect(result.summary).toBe(summaryText);
  });

  it("creates embeddings via getGenerativeModel", async () => {
    const embedContent = vi
      .fn()
      .mockResolvedValueOnce({ embedding: { values: [0.1, 0.2] } })
      .mockResolvedValueOnce({ embedding: { values: [0.3, 0.4] } });
    const embeddingModel = {
      generateContent: vi.fn(),
      embedContent,
    };
    mocks.getGenerativeModelSpy.mockReturnValueOnce(embeddingModel);

    const aiInstance = createAI();
    const result = await aiInstance.embed({
      model: "gemini-embedding-001",
      input: ["doc one", "doc two"],
    });

    expect(mocks.getGenerativeModelSpy).toHaveBeenCalledWith({
      model: "gemini-embedding-001",
    });
    expect(embedContent).toHaveBeenCalledTimes(2);
    expect(embedContent).toHaveBeenNthCalledWith(1, "doc one");
    expect(embedContent).toHaveBeenNthCalledWith(2, "doc two");
    expect(result.embeddings).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });
});
