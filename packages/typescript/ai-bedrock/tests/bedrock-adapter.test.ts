import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime'
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

    describe('chatStream', () => {
        it('should handle streaming response', async () => {
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

            const contentChunks = chunks.filter(c => c.type === 'content')
            expect(contentChunks).toEqual([
                expect.objectContaining({ type: 'content', delta: 'Hello ' }),
                expect.objectContaining({ type: 'content', delta: 'world' }),
            ])

            expect(chunks.find(c => c.type === 'done')).toBeDefined()
        })

        it('should use SDK totalTokens when provided', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: 'Hello' } } },
                { messageStop: { stopReason: 'end_turn' } },
                { metadata: { usage: { inputTokens: 10, outputTokens: 25, totalTokens: 35 } } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const doneChunk = chunks.find(c => c.type === 'done') as any
            expect(doneChunk.usage).toEqual({
                promptTokens: 10,
                completionTokens: 25,
                totalTokens: 35,
            })
        })

        it('should fall back to computing totalTokens when SDK omits it', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: 'Hello' } } },
                { messageStop: { stopReason: 'end_turn' } },
                { metadata: { usage: { inputTokens: 10, outputTokens: 25 } } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const doneChunk = chunks.find(c => c.type === 'done')
            expect(doneChunk).toBeDefined()
            expect(doneChunk.usage).toEqual({
                promptTokens: 10,
                completionTokens: 25,
                totalTokens: 35,
            })
        })

        it('should emit done with tool_calls finishReason on tool_use stop', async () => {
            makeStream([
                { contentBlockStart: { start: { toolUse: { toolUseId: 'tu-1', name: 'myTool' } } } },
                { contentBlockDelta: { delta: { toolUse: { input: '{"x":1}' } } } },
                { messageStop: { stopReason: 'tool_use' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const doneChunk = chunks.find(c => c.type === 'done')
            expect(doneChunk?.finishReason).toBe('tool_calls')
        })
    })

    // -----------------------------------------------------------------------
    // Claude native reasoning (delta.reasoningContent — Bedrock Converse API)
    // -----------------------------------------------------------------------

    describe('Claude native reasoning (reasoningContent blocks)', () => {
        it('emits thinking chunks from delta.reasoningContent.text', async () => {
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

            const thinkingChunks = chunks.filter(c => c.type === 'thinking')
            expect(thinkingChunks).toHaveLength(2)
            expect(thinkingChunks[0]).toMatchObject({ delta: 'step one ', content: 'step one ' })
            expect(thinkingChunks[1]).toMatchObject({ delta: 'step two', content: 'step one step two' })

            // signature chunk must NOT produce any output
            expect(chunks.filter(c => c.type === 'thinking')).toHaveLength(2)

            const contentChunks = chunks.filter(c => c.type === 'content')
            expect(contentChunks).toHaveLength(1)
            expect(contentChunks[0]).toMatchObject({ delta: 'answer' })
        })

        it('does not emit thinking chunks for signature-only deltas', async () => {
            makeStream([
                { contentBlockDelta: { delta: { reasoningContent: { signature: 'sig-xyz' } } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            expect(chunks.filter(c => c.type === 'thinking')).toHaveLength(0)
        })
    })

    // -----------------------------------------------------------------------
    // Nova thinking tag parsing (text-based <thinking> tags in delta.text)
    // -----------------------------------------------------------------------

    describe('Nova thinking tag parsing (text-based)', () => {
        it('emits thinking and content chunks from a single chunk containing full tags', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: '<thinking>some thought</thinking>answer' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const thinkingChunks = chunks.filter(c => c.type === 'thinking')
            const contentChunks = chunks.filter(c => c.type === 'content')

            expect(thinkingChunks).toHaveLength(1)
            expect(thinkingChunks[0]).toMatchObject({
                type: 'thinking',
                delta: 'some thought',
                content: 'some thought',
            })

            expect(contentChunks).toHaveLength(1)
            expect(contentChunks[0]).toMatchObject({
                type: 'content',
                delta: 'answer',
                content: 'answer',
            })
        })

        it('emits content before thinking tag then thinking content', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: 'prefix<thinking>inside</thinking>' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const thinkingChunks = chunks.filter(c => c.type === 'thinking')
            const contentChunks = chunks.filter(c => c.type === 'content')

            expect(contentChunks[0]).toMatchObject({ delta: 'prefix' })
            expect(thinkingChunks[0]).toMatchObject({ delta: 'inside' })
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

            const thinkingChunks = chunks.filter(c => c.type === 'thinking')
            const contentChunks = chunks.filter(c => c.type === 'content')

            expect(thinkingChunks.length).toBeGreaterThan(0)
            expect(thinkingChunks.at(-1)?.content).toBe('thought')

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

            const thinkingChunks = chunks.filter(c => c.type === 'thinking')
            const contentChunks = chunks.filter(c => c.type === 'content')

            expect(thinkingChunks.at(-1)?.content).toBe('thought')
            expect(contentChunks.length).toBeGreaterThan(0)
            expect(contentChunks.at(-1)?.content).toBe('after')
        })

        it('accumulates thinking content across multiple chunks within tags', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: '<thinking>part one ' } } },
                { contentBlockDelta: { delta: { text: 'part two</thinking>' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            const thinkingChunks = chunks.filter(c => c.type === 'thinking')
            expect(thinkingChunks.length).toBeGreaterThan(0)
            // Final accumulated content should contain both parts
            expect(thinkingChunks.at(-1)?.content).toBe('part one part two')
        })

        it('does not emit thinking chunks when no thinking tags are present', async () => {
            makeStream([
                { contentBlockDelta: { delta: { text: 'plain text response' } } },
                { messageStop: { stopReason: 'end_turn' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            expect(chunks.filter(c => c.type === 'thinking')).toHaveLength(0)
            expect(chunks.filter(c => c.type === 'content')).toHaveLength(1)
        })
    })

    // -----------------------------------------------------------------------
    // Tool call streaming
    // -----------------------------------------------------------------------

    describe('tool call streaming', () => {
        it('emits tool_call chunk with name and id when contentBlockStart fires', async () => {
            makeStream([
                { contentBlockStart: { start: { toolUse: { toolUseId: 'tool-abc', name: 'getWeather' } } } },
                { messageStop: { stopReason: 'tool_use' } },
            ])

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'weather?' }],
            }))

            const toolCallChunks = chunks.filter(c => c.type === 'tool_call')
            expect(toolCallChunks.length).toBeGreaterThan(0)
            expect(toolCallChunks[0]).toMatchObject({
                type: 'tool_call',
                index: 0,
                toolCall: {
                    id: 'tool-abc',
                    type: 'function',
                    function: { name: 'getWeather', arguments: '' },
                },
            })
        })

        it('emits argument delta chunks for tool input', async () => {
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

            // Argument delta chunks have an empty name (only the start chunk has the name)
            const argChunks = chunks.filter(
                c => c.type === 'tool_call' && c.toolCall.function.name === ''
            )
            expect(argChunks).toHaveLength(2)
            expect(argChunks[0].toolCall.function.arguments).toBe('{"city"')
            expect(argChunks[1].toolCall.function.arguments).toBe(':"Paris"}')
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

            // Start chunks have non-empty names
            const startChunks = chunks.filter(
                c => c.type === 'tool_call' && c.toolCall.function.name !== ''
            )
            expect(startChunks[0]).toMatchObject({ index: 0, toolCall: { id: 'tool-1' } })
            expect(startChunks[1]).toMatchObject({ index: 1, toolCall: { id: 'tool-2' } })
        })
    })

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------

    describe('error handling', () => {
        it('yields an error chunk when no stream is returned', async () => {
            sendMock.mockResolvedValue({ stream: undefined })

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            expect(chunks).toHaveLength(1)
            expect(chunks[0]).toMatchObject({
                type: 'error',
                error: { message: 'No stream received from Bedrock' },
            })
        })

        it('yields an error chunk when client.send throws', async () => {
            sendMock.mockRejectedValue(new Error('Network failure'))

            const chunks = await collectChunks(adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            }))

            expect(chunks).toHaveLength(1)
            expect(chunks[0]).toMatchObject({
                type: 'error',
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
                (m: any) => m.content?.[0]?.toolResult !== undefined
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
                (m: any) => m.content?.[0]?.toolResult !== undefined
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
                (m: any) => m.role === 'assistant' && m.content?.some((b: any) => b.toolUse)
            )
            expect(assistantMsg).toBeDefined()
            expect(assistantMsg.content).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ text: 'Let me check that' }),
                    expect.objectContaining({
                        toolUse: expect.objectContaining({ name: 'lookup', toolUseId: 'tc-1' }),
                    }),
                ])
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
})
