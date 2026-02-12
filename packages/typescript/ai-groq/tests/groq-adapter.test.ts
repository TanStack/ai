import { describe, it, expect, vi, afterEach, beforeEach, type Mock } from 'vitest'
import { createGroqText, groqText } from '../src/adapters/text'
import type { StreamChunk, Tool } from '@tanstack/ai'

// Declare mockCreate at module level
let mockCreate: Mock<(...args: Array<unknown>) => unknown>

// Mock the Groq SDK
vi.mock('groq-sdk', () => {
    return {
        default: class {
            chat = {
                completions: {
                    create: (...args: Array<unknown>) => mockCreate(...args),
                },
            }
        },
    }
})

// Helper to create async iterable from chunks
function createAsyncIterable<T>(chunks: Array<T>): AsyncIterable<T> {
    return {
        [Symbol.asyncIterator]() {
            let index = 0
            return {
                async next() {
                    if (index < chunks.length) {
                        return { value: chunks[index++]!, done: false }
                    }
                    return { value: undefined as T, done: true }
                },
            }
        },
    }
}

// Helper to setup the mock SDK client for streaming responses
function setupMockSdkClient(
    streamChunks: Array<Record<string, unknown>>,
    nonStreamResponse?: Record<string, unknown>,
) {
    mockCreate = vi.fn().mockImplementation((params) => {
        if (params.stream) {
            return Promise.resolve(createAsyncIterable(streamChunks))
        }
        return Promise.resolve(nonStreamResponse)
    })
}

const weatherTool: Tool = {
    name: 'lookup_weather',
    description: 'Return the forecast for a location',
}

describe('Groq adapters', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    describe('Text adapter', () => {
        it('creates a text adapter with explicit API key', () => {
            const adapter = createGroqText(
                'llama-3.3-70b-versatile',
                'test-api-key',
            )

            expect(adapter).toBeDefined()
            expect(adapter.kind).toBe('text')
            expect(adapter.name).toBe('groq')
            expect(adapter.model).toBe('llama-3.3-70b-versatile')
        })

        it('creates a text adapter from environment variable', () => {
            vi.stubEnv('GROQ_API_KEY', 'env-api-key')

            const adapter = groqText('llama-3.1-8b-instant')

            expect(adapter).toBeDefined()
            expect(adapter.kind).toBe('text')
            expect(adapter.model).toBe('llama-3.1-8b-instant')
        })

        it('throws if GROQ_API_KEY is not set when using groqText', () => {
            vi.stubEnv('GROQ_API_KEY', '')

            expect(() => groqText('llama-3.3-70b-versatile')).toThrow(
                'GROQ_API_KEY is required',
            )
        })

        it('allows custom baseURL override', () => {
            const adapter = createGroqText(
                'llama-3.3-70b-versatile',
                'test-api-key',
                {
                    baseURL: 'https://custom.api.example.com/v1',
                },
            )

            expect(adapter).toBeDefined()
        })
    })
})

describe('Groq AG-UI event emission', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('emits RUN_STARTED as the first event', async () => {
        const streamChunks = [
            {
                id: 'chatcmpl-123',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: { content: 'Hello' },
                        finish_reason: null,
                    },
                ],
            },
            {
                id: 'chatcmpl-123',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: {},
                        finish_reason: 'stop',
                    },
                ],
                usage: {
                    prompt_tokens: 5,
                    completion_tokens: 1,
                    total_tokens: 6,
                },
            },
        ]

        setupMockSdkClient(streamChunks)
        const adapter = createGroqText(
            'llama-3.3-70b-versatile',
            'test-api-key',
        )
        const chunks: Array<StreamChunk> = []

        for await (const chunk of adapter.chatStream({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Hello' }],
        })) {
            chunks.push(chunk)
        }

        expect(chunks[0]?.type).toBe('RUN_STARTED')
        if (chunks[0]?.type === 'RUN_STARTED') {
            expect(chunks[0].runId).toBeDefined()
            expect(chunks[0].model).toBe('llama-3.3-70b-versatile')
        }
    })

    it('emits TEXT_MESSAGE_START before TEXT_MESSAGE_CONTENT', async () => {
        const streamChunks = [
            {
                id: 'chatcmpl-123',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: { content: 'Hello' },
                        finish_reason: null,
                    },
                ],
            },
            {
                id: 'chatcmpl-123',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: {},
                        finish_reason: 'stop',
                    },
                ],
                usage: {
                    prompt_tokens: 5,
                    completion_tokens: 1,
                    total_tokens: 6,
                },
            },
        ]

        setupMockSdkClient(streamChunks)
        const adapter = createGroqText(
            'llama-3.3-70b-versatile',
            'test-api-key',
        )
        const chunks: Array<StreamChunk> = []

        for await (const chunk of adapter.chatStream({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Hello' }],
        })) {
            chunks.push(chunk)
        }

        const textStartIndex = chunks.findIndex(
            (c) => c.type === 'TEXT_MESSAGE_START',
        )
        const textContentIndex = chunks.findIndex(
            (c) => c.type === 'TEXT_MESSAGE_CONTENT',
        )

        expect(textStartIndex).toBeGreaterThan(-1)
        expect(textContentIndex).toBeGreaterThan(-1)
        expect(textStartIndex).toBeLessThan(textContentIndex)

        const textStart = chunks[textStartIndex]
        if (textStart?.type === 'TEXT_MESSAGE_START') {
            expect(textStart.messageId).toBeDefined()
            expect(textStart.role).toBe('assistant')
        }
    })

    it('emits TEXT_MESSAGE_END and RUN_FINISHED at the end', async () => {
        const streamChunks = [
            {
                id: 'chatcmpl-123',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: { content: 'Hello' },
                        finish_reason: null,
                    },
                ],
            },
            {
                id: 'chatcmpl-123',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: {},
                        finish_reason: 'stop',
                    },
                ],
                usage: {
                    prompt_tokens: 5,
                    completion_tokens: 1,
                    total_tokens: 6,
                },
            },
        ]

        setupMockSdkClient(streamChunks)
        const adapter = createGroqText(
            'llama-3.3-70b-versatile',
            'test-api-key',
        )
        const chunks: Array<StreamChunk> = []

        for await (const chunk of adapter.chatStream({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Hello' }],
        })) {
            chunks.push(chunk)
        }

        const textEndChunk = chunks.find((c) => c.type === 'TEXT_MESSAGE_END')
        expect(textEndChunk).toBeDefined()
        if (textEndChunk?.type === 'TEXT_MESSAGE_END') {
            expect(textEndChunk.messageId).toBeDefined()
        }

        const runFinishedChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
        expect(runFinishedChunk).toBeDefined()
        if (runFinishedChunk?.type === 'RUN_FINISHED') {
            expect(runFinishedChunk.runId).toBeDefined()
            expect(runFinishedChunk.finishReason).toBe('stop')
            expect(runFinishedChunk.usage).toMatchObject({
                promptTokens: 5,
                completionTokens: 1,
                totalTokens: 6,
            })
        }
    })

    it('emits AG-UI tool call events', async () => {
        const streamChunks = [
            {
                id: 'chatcmpl-456',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    id: 'call_abc123',
                                    type: 'function',
                                    function: {
                                        name: 'lookup_weather',
                                        arguments: '{"location":',
                                    },
                                },
                            ],
                        },
                        finish_reason: null,
                    },
                ],
            },
            {
                id: 'chatcmpl-456',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    function: {
                                        arguments: '"Berlin"}',
                                    },
                                },
                            ],
                        },
                        finish_reason: null,
                    },
                ],
            },
            {
                id: 'chatcmpl-456',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: {},
                        finish_reason: 'tool_calls',
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
            },
        ]

        setupMockSdkClient(streamChunks)
        const adapter = createGroqText(
            'llama-3.3-70b-versatile',
            'test-api-key',
        )
        const chunks: Array<StreamChunk> = []

        for await (const chunk of adapter.chatStream({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Weather in Berlin?' }],
            tools: [weatherTool],
        })) {
            chunks.push(chunk)
        }

        // Check AG-UI tool events
        const toolStartChunk = chunks.find((c) => c.type === 'TOOL_CALL_START')
        expect(toolStartChunk).toBeDefined()
        if (toolStartChunk?.type === 'TOOL_CALL_START') {
            expect(toolStartChunk.toolCallId).toBe('call_abc123')
            expect(toolStartChunk.toolName).toBe('lookup_weather')
        }

        const toolArgsChunks = chunks.filter((c) => c.type === 'TOOL_CALL_ARGS')
        expect(toolArgsChunks.length).toBeGreaterThan(0)

        const toolEndChunk = chunks.find((c) => c.type === 'TOOL_CALL_END')
        expect(toolEndChunk).toBeDefined()
        if (toolEndChunk?.type === 'TOOL_CALL_END') {
            expect(toolEndChunk.toolCallId).toBe('call_abc123')
            expect(toolEndChunk.toolName).toBe('lookup_weather')
            expect(toolEndChunk.input).toEqual({ location: 'Berlin' })
        }

        // Check finish reason
        const runFinishedChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
        if (runFinishedChunk?.type === 'RUN_FINISHED') {
            expect(runFinishedChunk.finishReason).toBe('tool_calls')
        }
    })

    it('emits RUN_ERROR on stream error', async () => {
        const streamChunks = [
            {
                id: 'chatcmpl-123',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: { content: 'Hello' },
                        finish_reason: null,
                    },
                ],
            },
        ]

        // Create an async iterable that throws mid-stream
        const errorIterable = {
            [Symbol.asyncIterator]() {
                let index = 0
                return {
                    async next() {
                        if (index < streamChunks.length) {
                            return { value: streamChunks[index++]!, done: false }
                        }
                        throw new Error('Stream interrupted')
                    },
                }
            },
        }

        mockCreate = vi.fn().mockResolvedValue(errorIterable)

        const adapter = createGroqText(
            'llama-3.3-70b-versatile',
            'test-api-key',
        )
        const chunks: Array<StreamChunk> = []

        for await (const chunk of adapter.chatStream({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Hello' }],
        })) {
            chunks.push(chunk)
        }

        // Should emit RUN_ERROR
        const runErrorChunk = chunks.find((c) => c.type === 'RUN_ERROR')
        expect(runErrorChunk).toBeDefined()
        if (runErrorChunk?.type === 'RUN_ERROR') {
            expect(runErrorChunk.error.message).toBe('Stream interrupted')
        }
    })

    it('emits proper AG-UI event sequence', async () => {
        const streamChunks = [
            {
                id: 'chatcmpl-123',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: { content: 'Hello world' },
                        finish_reason: null,
                    },
                ],
            },
            {
                id: 'chatcmpl-123',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: {},
                        finish_reason: 'stop',
                    },
                ],
                usage: {
                    prompt_tokens: 5,
                    completion_tokens: 2,
                    total_tokens: 7,
                },
            },
        ]

        setupMockSdkClient(streamChunks)
        const adapter = createGroqText(
            'llama-3.3-70b-versatile',
            'test-api-key',
        )
        const chunks: Array<StreamChunk> = []

        for await (const chunk of adapter.chatStream({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Hello' }],
        })) {
            chunks.push(chunk)
        }

        // Verify proper AG-UI event sequence
        const eventTypes = chunks.map((c) => c.type)

        // Should start with RUN_STARTED
        expect(eventTypes[0]).toBe('RUN_STARTED')

        // Should have TEXT_MESSAGE_START before TEXT_MESSAGE_CONTENT
        const textStartIndex = eventTypes.indexOf('TEXT_MESSAGE_START')
        const textContentIndex = eventTypes.indexOf('TEXT_MESSAGE_CONTENT')
        expect(textStartIndex).toBeGreaterThan(-1)
        expect(textContentIndex).toBeGreaterThan(textStartIndex)

        // Should have TEXT_MESSAGE_END before RUN_FINISHED
        const textEndIndex = eventTypes.indexOf('TEXT_MESSAGE_END')
        const runFinishedIndex = eventTypes.indexOf('RUN_FINISHED')
        expect(textEndIndex).toBeGreaterThan(-1)
        expect(runFinishedIndex).toBeGreaterThan(textEndIndex)

        // Verify RUN_FINISHED has proper data
        const runFinishedChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
        if (runFinishedChunk?.type === 'RUN_FINISHED') {
            expect(runFinishedChunk.finishReason).toBe('stop')
            expect(runFinishedChunk.usage).toBeDefined()
        }
    })

    it('streams content with correct accumulated values', async () => {
        const streamChunks = [
            {
                id: 'chatcmpl-stream',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: { content: 'Hello ' },
                        finish_reason: null,
                    },
                ],
            },
            {
                id: 'chatcmpl-stream',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: { content: 'world' },
                        finish_reason: null,
                    },
                ],
            },
            {
                id: 'chatcmpl-stream',
                model: 'llama-3.3-70b-versatile',
                choices: [
                    {
                        delta: {},
                        finish_reason: 'stop',
                    },
                ],
                usage: {
                    prompt_tokens: 5,
                    completion_tokens: 2,
                    total_tokens: 7,
                },
            },
        ]

        setupMockSdkClient(streamChunks)
        const adapter = createGroqText(
            'llama-3.3-70b-versatile',
            'test-api-key',
        )
        const chunks: Array<StreamChunk> = []

        for await (const chunk of adapter.chatStream({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: 'Say hello' }],
        })) {
            chunks.push(chunk)
        }

        // Check TEXT_MESSAGE_CONTENT events have correct accumulated content
        const contentChunks = chunks.filter(
            (c) => c.type === 'TEXT_MESSAGE_CONTENT',
        )
        expect(contentChunks.length).toBe(2)

        const firstContent = contentChunks[0]
        if (firstContent?.type === 'TEXT_MESSAGE_CONTENT') {
            expect(firstContent.delta).toBe('Hello ')
            expect(firstContent.content).toBe('Hello ')
        }

        const secondContent = contentChunks[1]
        if (secondContent?.type === 'TEXT_MESSAGE_CONTENT') {
            expect(secondContent.delta).toBe('world')
            expect(secondContent.content).toBe('Hello world')
        }
    })
})
