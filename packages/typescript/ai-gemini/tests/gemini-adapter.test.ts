import { describe, it, expect, beforeEach, vi } from 'vitest'
import { chat, summarize } from '@tanstack/ai'
import type { Tool, StreamChunk } from '@tanstack/ai'
import {
  Type,
  type HarmBlockThreshold,
  type HarmCategory,
  type SafetySetting,
} from '@google/genai'
import { GeminiTextAdapter } from '../src/adapters/text'
import { GeminiSummarizeAdapter } from '../src/adapters/summarize'
import type { GeminiTextProviderOptions } from '../src/adapters/text'
import type { Schema } from '@google/genai'

const mocks = vi.hoisted(() => {
  return {
    constructorSpy: vi.fn<(options: { apiKey: string }) => void>(),
    generateContentSpy: vi.fn(),
    generateContentStreamSpy: vi.fn(),
    getGenerativeModelSpy: vi.fn(),
  }
})

vi.mock('@google/genai', async () => {
  const {
    constructorSpy,
    generateContentSpy,
    generateContentStreamSpy,
    getGenerativeModelSpy,
  } = mocks

  const actual = await vi.importActual<any>('@google/genai')
  class MockGoogleGenAI {
    public models = {
      generateContent: generateContentSpy,
      generateContentStream: generateContentStreamSpy,
    }

    public getGenerativeModel = getGenerativeModelSpy

    constructor(options: { apiKey: string }) {
      constructorSpy(options)
    }
  }

  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: actual.Type,
    FinishReason: actual.FinishReason,
  }
})

const createTextAdapter = () =>
  new GeminiTextAdapter({ apiKey: 'test-key' }, 'gemini-2.5-pro')
const createSummarizeAdapter = () =>
  new GeminiSummarizeAdapter('test-key', 'gemini-2.0-flash')

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the weather for a location',
}

const createStream = (chunks: Array<Record<string, unknown>>) => {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk
    }
  })()
}

describe('GeminiAdapter through AI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps provider options for chat streaming', async () => {
    const streamChunks = [
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Sunny skies ahead' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 3,
          candidatesTokenCount: 1,
          totalTokenCount: 4,
        },
      },
    ]

    mocks.generateContentStreamSpy.mockResolvedValue(createStream(streamChunks))

    const adapter = createTextAdapter()

    // Consume the stream to trigger the API call
    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'How is the weather in Madrid?' }],
      modelOptions: {
        topK: 9,
      },
      temperature: 0.4,
      topP: 0.8,
      maxTokens: 256,
      tools: [weatherTool],
    })) {
      /* consume stream */
    }

    expect(mocks.generateContentStreamSpy).toHaveBeenCalledTimes(1)
    const [payload] = mocks.generateContentStreamSpy.mock.calls[0]
    expect(payload.model).toBe('gemini-2.5-pro')
    expect(payload.config).toMatchObject({
      temperature: 0.4,
      topP: 0.8,
      maxOutputTokens: 256,
      topK: 9,
    })
    expect(payload.config?.tools?.[0]?.functionDeclarations?.[0]?.name).toBe(
      'lookup_weather',
    )
    expect(payload.contents).toEqual([
      {
        role: 'user',
        parts: [{ text: 'How is the weather in Madrid?' }],
      },
    ])
  })

  it('maps every common and provider option into the Gemini payload', async () => {
    const streamChunks = [
      {
        candidates: [
          {
            content: {
              parts: [{ text: '' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: undefined,
      },
    ]

    mocks.generateContentStreamSpy.mockResolvedValue(createStream(streamChunks))

    const safetySettings: SafetySetting[] = [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH' as HarmCategory,
        threshold: 'BLOCK_LOW_AND_ABOVE' as HarmBlockThreshold,
      },
    ]

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
      },
    }

    const responseJsonSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        ok: { type: Type.BOOLEAN },
      },
    }

    const providerOptions: GeminiTextProviderOptions = {
      safetySettings,
      generationConfig: {
        stopSequences: ['<done>', '###'],
        responseMimeType: 'application/json',
        responseSchema,
        responseJsonSchema,
        responseModalities: ['TEXT'],
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
              voiceName: 'Studio',
            },
          },
        },
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 128,
        },
        imageConfig: {
          aspectRatio: '1:1',
        },
      },
      cachedContent: 'cachedContents/weather-context',
    } as const

    const adapter = createTextAdapter()

    // Consume the stream to trigger the API call
    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'Provide structured response' }],
      temperature: 0.61,
      topP: 0.37,
      maxTokens: 512,
      systemPrompts: ['Stay concise', 'Return JSON'],
      modelOptions: providerOptions,
    })) {
      /* consume stream */
    }

    expect(mocks.generateContentStreamSpy).toHaveBeenCalledTimes(1)
    const [payload] = mocks.generateContentStreamSpy.mock.calls[0]
    const config = payload.config

    expect(config.temperature).toBe(0.61)
    expect(config.topP).toBe(0.37)
    expect(config.maxOutputTokens).toBe(512)
    expect(config.cachedContent).toBe(providerOptions.cachedContent)
    expect(config.safetySettings).toEqual(providerOptions.safetySettings)
    expect(config.stopSequences).toEqual(providerOptions?.stopSequences)
    expect(config.responseMimeType).toBe(providerOptions?.responseMimeType)
    expect(config.responseSchema).toEqual(providerOptions?.responseSchema)
    expect(config.responseJsonSchema).toEqual(
      providerOptions?.responseJsonSchema,
    )
    expect(config.responseModalities).toEqual(
      providerOptions?.responseModalities,
    )
    expect(config.candidateCount).toBe(providerOptions?.candidateCount)
    expect(config.topK).toBe(providerOptions?.topK)
    expect(config.seed).toBe(providerOptions?.seed)
    expect(config.presencePenalty).toBe(providerOptions?.presencePenalty)
    expect(config.frequencyPenalty).toBe(providerOptions?.frequencyPenalty)
    expect(config.responseLogprobs).toBe(providerOptions?.responseLogprobs)
    expect(config.logprobs).toBe(providerOptions?.logprobs)
    expect(config.enableEnhancedCivicAnswers).toBe(
      providerOptions?.enableEnhancedCivicAnswers,
    )
    expect(config.speechConfig).toEqual(providerOptions?.speechConfig)
    expect(config.thinkingConfig).toEqual(providerOptions?.thinkingConfig)
    expect(config.imageConfig).toEqual(providerOptions?.imageConfig)
  })

  it('streams chat chunks using mapped provider config', async () => {
    const streamChunks = [
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Partly ' }],
            },
          },
        ],
      },
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'cloudy' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 4,
          candidatesTokenCount: 2,
          totalTokenCount: 6,
        },
      },
    ]

    mocks.generateContentStreamSpy.mockResolvedValue(createStream(streamChunks))

    const adapter = createTextAdapter()
    const received: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Tell me a joke' }],
      modelOptions: {
        topK: 3,
      },
      temperature: 0.2,
    })) {
      received.push(chunk)
    }

    expect(mocks.generateContentStreamSpy).toHaveBeenCalledTimes(1)
    const [streamPayload] = mocks.generateContentStreamSpy.mock.calls[0]
    expect(streamPayload.config?.topK).toBe(3)

    // AG-UI events: RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT..., TEXT_MESSAGE_END, RUN_FINISHED
    expect(received[0]).toMatchObject({
      type: 'RUN_STARTED',
    })
    expect(received[1]).toMatchObject({
      type: 'TEXT_MESSAGE_START',
      role: 'assistant',
    })
    expect(received[2]).toMatchObject({
      type: 'TEXT_MESSAGE_CONTENT',
      delta: 'Partly ',
      content: 'Partly ',
    })
    expect(received[3]).toMatchObject({
      type: 'TEXT_MESSAGE_CONTENT',
      delta: 'cloudy',
      content: 'Partly cloudy',
    })
    expect(received[4]).toMatchObject({
      type: 'TEXT_MESSAGE_END',
    })
    expect(received.at(-1)).toMatchObject({
      type: 'RUN_FINISHED',
      finishReason: 'stop',
      usage: {
        promptTokens: 4,
        completionTokens: 2,
        totalTokens: 6,
      },
    })
  })

  it('merges consecutive user messages when tool results precede a follow-up user message', async () => {
    const streamChunks = [
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Here is a recommendation' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      },
    ]

    mocks.generateContentStreamSpy.mockResolvedValue(createStream(streamChunks))

    const adapter = createTextAdapter()

    for await (const _ of chat({
      adapter,
      messages: [
        { role: 'user', content: 'What is the weather in Berlin?' },
        {
          role: 'assistant',
          content: 'Let me check.',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'lookup_weather',
                arguments: '{"location":"Berlin"}',
              },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_1', content: '{"temp":72}' },
        { role: 'user', content: 'What about Paris?' },
      ],
      tools: [weatherTool],
    })) {
      /* consume */
    }

    expect(mocks.generateContentStreamSpy).toHaveBeenCalledTimes(1)
    const [payload] = mocks.generateContentStreamSpy.mock.calls[0]

    // Tool result (user) and follow-up user message should be merged
    const roles = payload.contents.map((m: any) => m.role)
    for (let i = 1; i < roles.length; i++) {
      expect(roles[i]).not.toBe(roles[i - 1])
    }

    // Should have 3 messages: user, model, user (merged tool result + follow-up)
    expect(payload.contents).toHaveLength(3)
    expect(payload.contents[0].role).toBe('user')
    expect(payload.contents[1].role).toBe('model')
    expect(payload.contents[2].role).toBe('user')

    // Last user message should contain both functionResponse and text
    const lastParts = payload.contents[2].parts
    const hasFunctionResponse = lastParts.some((p: any) => p.functionResponse)
    const hasText = lastParts.some((p: any) => p.text === 'What about Paris?')
    expect(hasFunctionResponse).toBe(true)
    expect(hasText).toBe(true)
  })

  it('handles full multi-turn with duplicate tool results and empty model message', async () => {
    const streamChunks = [
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Electric guitars available' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 5,
          totalTokenCount: 25,
        },
      },
    ]

    mocks.generateContentStreamSpy.mockResolvedValue(createStream(streamChunks))

    const adapter = createTextAdapter()

    for await (const _ of chat({
      adapter,
      messages: [
        { role: 'user', content: "what's a good acoustic guitar?" },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call_guitars',
              type: 'function',
              function: { name: 'getGuitars', arguments: '' },
            },
            {
              id: 'call_recommend',
              type: 'function',
              function: {
                name: 'recommendGuitar',
                arguments: '{"id":7}',
              },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'call_guitars',
          content: '[{"id":7,"name":"Guitar"}]',
        },
        {
          role: 'tool',
          toolCallId: 'call_recommend',
          content: '{"id":7}',
        },
        // Duplicate tool result (from client tool output)
        {
          role: 'tool',
          toolCallId: 'call_recommend',
          content: '{"id":7}',
        },
        // Empty assistant from client tool round-trip
        { role: 'assistant', content: null },
        // Follow-up
        { role: 'user', content: "what's a good electric guitar?" },
      ],
      tools: [weatherTool],
    })) {
      /* consume */
    }

    expect(mocks.generateContentStreamSpy).toHaveBeenCalledTimes(1)
    const [payload] = mocks.generateContentStreamSpy.mock.calls[0]

    // No consecutive same-role messages
    const roles = payload.contents.map((m: any) => m.role)
    for (let i = 1; i < roles.length; i++) {
      expect(roles[i]).not.toBe(roles[i - 1])
    }

    // Should be 3 messages: user, model, user
    expect(payload.contents).toHaveLength(3)

    // Last user should have deduplicated functionResponses + follow-up text
    const lastParts = payload.contents[2].parts
    const functionResponses = lastParts.filter((p: any) => p.functionResponse)
    // 2 unique tool call IDs, not 3 (duplicate removed)
    expect(functionResponses).toHaveLength(2)

    const textParts = lastParts.filter(
      (p: any) => p.text === "what's a good electric guitar?",
    )
    expect(textParts).toHaveLength(1)
  })

  it('uses summarize function with models API', async () => {
    const summaryText = 'Short and sweet.'
    mocks.generateContentSpy.mockResolvedValueOnce({
      text: summaryText,
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
      },
    })

    const adapter = createSummarizeAdapter()
    const result = await summarize({
      adapter,
      text: 'A very long passage that needs to be shortened',
      maxLength: 123,
      style: 'paragraph',
    })

    expect(mocks.generateContentSpy).toHaveBeenCalledTimes(1)
    const [payload] = mocks.generateContentSpy.mock.calls[0]
    expect(payload.model).toBe('gemini-2.0-flash')
    expect(payload.config.systemInstruction).toContain('summarizes text')
    expect(payload.config.systemInstruction).toContain('123 tokens')
    expect(result.summary).toBe(summaryText)
  })
})
