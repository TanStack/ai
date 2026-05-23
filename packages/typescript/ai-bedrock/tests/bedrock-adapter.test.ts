import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { EventType } from '@tanstack/ai'
import { BedrockTextAdapter } from '../src/adapters/text'

// Mock the AWS SDK
const { sendMock } = vi.hoisted(() => {
    return { sendMock: vi.fn() }
})

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
    return {
        BedrockRuntimeClient: class {
            send = sendMock
        },
        ConverseStreamCommand: vi.fn(),
    }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStream(events: Array<object>) {
    sendMock.mockResolvedValue({
        stream: (async function* () {
            for (const event of events) {
                await Promise.resolve()
                yield event
            }
        })(),
    })
}

async function collectChunks(stream: AsyncIterable<any>): Promise<any[]> {
    const chunks: any[] = []
    for await (const chunk of stream) {
        chunks.push(chunk)
    }
    return chunks
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BedrockTextAdapter', () => {
    let adapter: BedrockTextAdapter<any>

    beforeEach(() => {
        vi.clearAllMocks()
        adapter = new BedrockTextAdapter({
            region: 'us-east-1',
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        }, 'anthropic.claude-3-sonnet-20240229-v1:0')
    })

    // -----------------------------------------------------------------------
    // Basic streaming
    // -----------------------------------------------------------------------

    describe('chatStream', () => {
        it('should emit RUN_STARTED, TEXT_MESSAGE_*, and RUN_FINISHED', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: 'Hello ' } } },
                { contentBlockDelta: { delta: { text: 'world' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            expect(ConverseStreamCommand).toHaveBeenCalled()

            // Should have RUN_STARTED
            const runStarted = chunks.find(c => c.type === EventType.RUN_STARTED)
            expect(runStarted).toBeDefined()
            expect(runStarted).toHaveProperty('threadId')
            expect(runStarted).toHaveProperty('runId')

            // Should have TEXT_MESSAGE_START
            const msgStart = chunks.find(c => c.type === EventType.TEXT_MESSAGE_START)
            expect(msgStart).toBeDefined()
            expect(msgStart).toMatchObject({ role: 'assistant' })

            // Should have TEXT_MESSAGE_CONTENT chunks
            const contentChunks = chunks.filter(c => c.type === EventType.TEXT_MESSAGE_CONTENT)
            expect(contentChunks.length).toBeGreaterThanOrEqual(2)
            expect(contentChunks[0]).toMatchObject({ delta: 'Hello ' })
            expect(contentChunks[1]).toMatchObject({ delta: 'world' })

            // Should have TEXT_MESSAGE_END
            const msgEnd = chunks.find(c => c.type === EventType.TEXT_MESSAGE_END)
            expect(msgEnd).toBeDefined()

            // Should have RUN_FINISHED
            const runFinished = chunks.find(c => c.type === EventType.RUN_FINISHED)
            expect(runFinished).toBeDefined()
        })

        it('should include usage in RUN_FINISHED when metadata is provided', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: 'Hello' } } },
                { messageStop: { stopReason: 'end_turn' } },
                { metadata: { usage: { inputTokens: 10, outputTokens: 25, totalTokens: 35 } } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const runFinished = chunks.find(c => c.type === EventType.RUN_FINISHED) as any
            expect(runFinished.usage).toEqual({
                promptTokens: 10,
                completionTokens: 25,
                totalTokens: 35,
            })
        })

        it('should compute totalTokens when SDK omits it', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: 'Hello' } } },
                { messageStop: { stopReason: 'end_turn' } },
                { metadata: { usage: { inputTokens: 10, outputTokens: 25 } } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const runFinished = chunks.find(c => c.type === EventType.RUN_FINISHED) as any
            expect(runFinished.usage).toEqual({
                promptTokens: 10,
                completionTokens: 25,
                totalTokens: 35,
            })
        })

        it('should emit TEXT_MESSAGE_END even without messageStop', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: 'Hello' } } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const msgEnd = chunks.find(c => c.type === EventType.TEXT_MESSAGE_END)
            expect(msgEnd).toBeDefined()

            const runFinished = chunks.find(c => c.type === EventType.RUN_FINISHED)
            expect(runFinished).toBeDefined()
        })
    })

    // -----------------------------------------------------------------------
    // Claude native reasoning (reasoningContent blocks)
    // -----------------------------------------------------------------------

    describe('Claude native reasoning (reasoningContent blocks)', () => {
        it('emits REASONING events from delta.reasoningContent.text', async () => {
            makeStream([
                { contentBlockDelta: { delta: { reasoningContent: { text: 'step one ' } } } },
                { contentBlockDelta: { delta: { reasoningContent: { text: 'step two' } } } },
                // signature delta — should be silently ignored
                { contentBlockDelta: { delta: { reasoningContent: { signature: 'sig-abc' } } } },
                { contentBlockDelta: { delta: { text: 'answer' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Reason through this' }],
            }))

            // Should have REASONING_START + REASONING_MESSAGE_START
            expect(chunks.find(c => c.type === EventType.REASONING_START)).toBeDefined()
            expect(chunks.find(c => c.type === EventType.REASONING_MESSAGE_START)).toBeDefined()

            // Should have 2 REASONING_MESSAGE_CONTENT chunks
            const reasoningChunks = chunks.filter(c => c.type === EventType.REASONING_MESSAGE_CONTENT)
            expect(reasoningChunks).toHaveLength(2)
            expect(reasoningChunks[0]).toMatchObject({ delta: 'step one ' })
            expect(reasoningChunks[1]).toMatchObject({ delta: 'step two' })

            // signature chunk must NOT produce any output
            expect(reasoningChunks).toHaveLength(2)

            // Should have content after reasoning
            const contentChunks = chunks.filter(c => c.type === EventType.TEXT_MESSAGE_CONTENT)
            expect(contentChunks).toHaveLength(1)
            expect(contentChunks[0]).toMatchObject({ delta: 'answer' })
        })

        it('does not emit reasoning for signature-only deltas', async () => {
            makeStream([
                { contentBlockDelta: { delta: { reasoningContent: { signature: 'sig-xyz' } } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            expect(chunks.filter(c => c.type === EventType.REASONING_MESSAGE_CONTENT)).toHaveLength(0)
        })
    })

    // -----------------------------------------------------------------------
    // Nova thinking tag parsing (text-based)
    // -----------------------------------------------------------------------

    describe('Nova thinking tag parsing (text-based)', () => {
        it('emits reasoning and text from a single chunk containing full tags', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: '<thinking>some thought</thinking>answer' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const reasoningChunks = chunks.filter(c => c.type === EventType.REASONING_MESSAGE_CONTENT)
            const contentChunks = chunks.filter(c => c.type === EventType.TEXT_MESSAGE_CONTENT)

            expect(reasoningChunks).toHaveLength(1)
            expect(reasoningChunks[0]).toMatchObject({
                type: EventType.REASONING_MESSAGE_CONTENT,
                delta: 'some thought',
            })

            expect(contentChunks).toHaveLength(1)
            expect(contentChunks[0]).toMatchObject({
                type: EventType.TEXT_MESSAGE_CONTENT,
                delta: 'answer',
                content: 'answer',
            })
        })

        it('emits content before thinking tag then reasoning content', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: 'prefix<thinking>inside</thinking>' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const contentChunks = chunks.filter(c => c.type === EventType.TEXT_MESSAGE_CONTENT)
            const reasoningChunks = chunks.filter(c => c.type === EventType.REASONING_MESSAGE_CONTENT)

            expect(contentChunks[0]).toMatchObject({ delta: 'prefix' })
            expect(reasoningChunks[0]).toMatchObject({ delta: 'inside' })
        })

        it('handles opening thinking tag split across two chunks', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: '<think' } } },
                { contentBlockDelta: { delta: { text: 'ing>thought</thinking>text' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const reasoningChunks = chunks.filter(c => c.type === EventType.REASONING_MESSAGE_CONTENT)
            const contentChunks = chunks.filter(c => c.type === EventType.TEXT_MESSAGE_CONTENT)

            expect(reasoningChunks.length).toBeGreaterThan(0)
            expect(reasoningChunks.at(-1)?.delta).toBeDefined()

            expect(contentChunks.length).toBeGreaterThan(0)
            expect(contentChunks.at(-1)?.content).toBe('text')
        })

        it('handles closing thinking tag split across two chunks', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: '<thinking>thought</think' } } },
                { contentBlockDelta: { delta: { text: 'ing>after' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const contentChunks = chunks.filter(c => c.type === EventType.TEXT_MESSAGE_CONTENT)
            expect(contentChunks.length).toBeGreaterThan(0)
            expect(contentChunks.at(-1)?.content).toBe('after')
        })

        it('accumulates reasoning content across multiple chunks within tags', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: '<thinking>part one ' } } },
                { contentBlockDelta: { delta: { text: 'part two</thinking>' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const reasoningChunks = chunks.filter(c => c.type === EventType.REASONING_MESSAGE_CONTENT)
            expect(reasoningChunks.length).toBeGreaterThan(0)
        })

        it('does not emit reasoning chunks when no thinking tags present', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: 'plain text response' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            expect(chunks.filter(c => c.type === EventType.REASONING_MESSAGE_CONTENT)).toHaveLength(0)
            expect(chunks.filter(c => c.type === EventType.TEXT_MESSAGE_CONTENT)).toHaveLength(1)
        })
    })

    // -----------------------------------------------------------------------
    // Tool call streaming
    // -----------------------------------------------------------------------

    describe('tool call streaming', () => {
        it('emits TOOL_CALL_START with name and id', async () => {
            makeStream([
                { contentBlockStart: { start: { toolUse: { toolUseId: 'tool-abc', name: 'getWeather' } } } },
                { messageStop: { stopReason: 'tool_use' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'weather?' }],
            }))

            const toolStart = chunks.find(c => c.type === EventType.TOOL_CALL_START)
            expect(toolStart).toBeDefined()
            expect(toolStart).toMatchObject({
                type: EventType.TOOL_CALL_START,
                toolCallId: 'tool-abc',
                toolCallName: 'getWeather',
                index: 0,
            })
        })

        it('emits TOOL_CALL_ARGS for tool input deltas', async () => {
            makeStream([
                { contentBlockStart: { start: { toolUse: { toolUseId: 'tool-abc', name: 'getWeather' } } } },
                { contentBlockDelta: { delta: { toolUse: { input: '{"city"' } } } },
                { contentBlockDelta: { delta: { toolUse: { input: ':"Paris"}' } } } },
                { messageStop: { stopReason: 'tool_use' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'weather?' }],
            }))

            const argChunks = chunks.filter(c => c.type === EventType.TOOL_CALL_ARGS)
            expect(argChunks).toHaveLength(2)
            expect(argChunks[0].delta).toBe('{"city"')
            expect(argChunks[1].delta).toBe(':"Paris"}')
        })

        it('increments index for each new tool call', async () => {
            makeStream([
                { contentBlockStart: { start: { toolUse: { toolUseId: 'tool-1', name: 'toolA' } } } },
                { contentBlockStart: { start: { toolUse: { toolUseId: 'tool-2', name: 'toolB' } } } },
                { messageStop: { stopReason: 'tool_use' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const startChunks = chunks.filter(c => c.type === EventType.TOOL_CALL_START)
            expect(startChunks[0]).toMatchObject({ index: 0, toolCallId: 'tool-1' })
            expect(startChunks[1]).toMatchObject({ index: 1, toolCallId: 'tool-2' })
        })

        it('emits TOOL_CALL_END on contentBlockStop', async () => {
            makeStream([
                { contentBlockStart: { start: { toolUse: { toolUseId: 'tool-abc', name: 'getWeather' } } } },
                { contentBlockDelta: { delta: { toolUse: { input: '{}' } } } },
                { contentBlockStop: {} },
                { messageStop: { stopReason: 'tool_use' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const toolEnd = chunks.find(c => c.type === EventType.TOOL_CALL_END)
            expect(toolEnd).toBeDefined()
            expect(toolEnd).toMatchObject({ toolCallId: 'tool-abc' })
        })
    })

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------

    describe('error handling', () => {
        it('yields RUN_ERROR when no stream is returned', async () => {
            sendMock.mockResolvedValue({ stream: undefined })

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const errorChunk = chunks.find(c => c.type === EventType.RUN_ERROR)
            expect(errorChunk).toBeDefined()
            expect(errorChunk).toMatchObject({
                type: EventType.RUN_ERROR,
                message: 'No stream received from Bedrock',
                error: { message: 'No stream received from Bedrock', code: 'NO_STREAM' },
            })
        })

        it('yields RUN_ERROR when client.send throws', async () => {
            sendMock.mockRejectedValue(new Error('Network failure'))

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const errorChunk = chunks.find(c => c.type === EventType.RUN_ERROR)
            expect(errorChunk).toBeDefined()
            expect(errorChunk).toMatchObject({
                type: EventType.RUN_ERROR,
                message: 'Network failure',
                error: { message: 'Network failure' },
            })
        })
    })

    // -----------------------------------------------------------------------
    // Message conversion (verified via ConverseStreamCommand call args)
    // -----------------------------------------------------------------------

    describe('message conversion', () => {
        it('converts tool result message to Converse toolResult format', async () => {
            makeStream([{ messageStop: { stopReason: 'end_turn' } }])

            await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [
                    { role: 'user', content: 'Use tool' },
                    {
                        role: 'assistant',
                        content: '',
                        toolCalls: [{ id: 'tu-1', type: 'function', function: { name: 'myTool', arguments: '{}' } }],
                    },
                    { role: 'tool', toolCallId: 'tu-1', content: '{"result":"ok"}' } as any,
                ],
            }))

            const [command] = (ConverseStreamCommand as any).mock.calls[0]
            const toolResultMsg = command.messages.find(
                (m: any) => m.content?.[0]?.toolResult !== undefined,
            )
            expect(toolResultMsg).toBeDefined()
            expect(toolResultMsg.role).toBe('user')
            expect(toolResultMsg.content[0].toolResult).toMatchObject({
                toolUseId: 'tu-1',
                status: 'success',
            })
        })

        it('marks tool result as failure when message has error status', async () => {
            makeStream([{ messageStop: { stopReason: 'end_turn' } }])

            await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [
                    { role: 'user', content: 'Use tool' },
                    {
                        role: 'assistant',
                        content: '',
                        toolCalls: [{ id: 'tu-1', type: 'function', function: { name: 'myTool', arguments: '{}' } }],
                    },
                    { role: 'tool', toolCallId: 'tu-1', content: 'failed', status: 'error' } as any,
                ],
            }))

            const [command] = (ConverseStreamCommand as any).mock.calls[0]
            const toolResultMsg = command.messages.find(
                (m: any) => m.content?.[0]?.toolResult !== undefined,
            )
            expect(toolResultMsg.content[0].toolResult.status).toBe('failure')
        })

        it('converts assistant message with tool calls to Converse content blocks', async () => {
            makeStream([{ messageStop: { stopReason: 'end_turn' } }])

            await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [
                    { role: 'user', content: 'Hi' },
                    {
                        role: 'assistant',
                        content: 'Let me check that',
                        toolCalls: [{ id: 'tc-1', type: 'function', function: { name: 'lookup', arguments: '{"q":"foo"}' } }],
                    },
                    { role: 'tool', toolCallId: 'tc-1', content: 'result' } as any,
                ],
            }))

            const [command] = (ConverseStreamCommand as any).mock.calls[0]
            const assistantMsg = command.messages.find(
                (m: any) => m.role === 'assistant' && m.content?.some((b: any) => b.toolUse),
            )
            expect(assistantMsg).toBeDefined()
            expect(assistantMsg.content).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ text: 'Let me check that' }),
                    expect.objectContaining({
                        toolUse: expect.objectContaining({ name: 'lookup', toolUseId: 'tc-1' }),
                    }),
                ]),
            )
        })

        it('passes system prompts to ConverseStreamCommand', async () => {
            makeStream([{ messageStop: { stopReason: 'end_turn' } }])

            await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
                systemPrompts: ['You are a helpful assistant.'],
            }))

            const [command] = (ConverseStreamCommand as any).mock.calls[0]
            expect(command.system).toEqual([{ text: 'You are a helpful assistant.' }])
        })
    })

    // -----------------------------------------------------------------------
    // Credential configuration
    // -----------------------------------------------------------------------

    describe('credential configuration', () => {
        it('creates client without credentials (default chain)', async () => {
            // We test that the adapter works when no auth config is passed.
            // The mock intercepts the client constructor, so we just verify
            // the stream works without explicit credentials.
            const noCredsAdapter = new BedrockTextAdapter({}, 'amazon.nova-pro-v1:0')

            makeStream([
                { contentBlockDelta: { delta: { text: 'ok' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(noCredsAdapter.chatStream({
                model: 'amazon.nova-pro-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            // Should stream successfully
            expect(chunks.find(c => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBeDefined()
            expect(chunks.find(c => c.type === EventType.RUN_FINISHED)).toBeDefined()
        })

        it('creates adapter with apiKey (bearer token)', async () => {
            const apiKeyAdapter = new BedrockTextAdapter(
                { apiKey: 'bedrock-key-abc123' },
                'amazon.nova-pro-v1:0',
            )

            makeStream([
                { contentBlockDelta: { delta: { text: 'ok' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(apiKeyAdapter.chatStream({
                model: 'amazon.nova-pro-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            expect(chunks.find(c => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBeDefined()
        })

        it('creates adapter with explicit credentials', async () => {
            const credsAdapter = new BedrockTextAdapter(
                {
                    region: 'us-west-2',
                    credentials: {
                        accessKeyId: 'my-key',
                        secretAccessKey: 'my-secret',
                    },
                },
                'amazon.nova-pro-v1:0',
            )

            makeStream([
                { contentBlockDelta: { delta: { text: 'ok' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(credsAdapter.chatStream({
                model: 'amazon.nova-pro-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            expect(chunks.find(c => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBeDefined()
        })
    })
})
