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
            // Mock ConverseStream API response format
            const mockStream = [
                {
                    contentBlockDelta: {
                        delta: { text: 'Hello ' }
                    }
                },
                {
                    contentBlockDelta: {
                        delta: { text: 'world' }
                    }
                },
                {
                    messageStop: {
                        stopReason: 'end_turn'
                    }
                },
            ]

            sendMock.mockResolvedValue({
                stream: (async function* () {
                    for (const event of mockStream) {
                        await Promise.resolve()
                        yield event
                    }
                })(),
            })

            const stream = adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            })

            const result = []
            for await (const chunk of stream) {
                result.push(chunk)
            }

            expect(ConverseStreamCommand).toHaveBeenCalled()
            // Filter for content chunks only
            const contentChunks = result.filter(c => c.type === 'content')
            expect(contentChunks).toEqual([
                expect.objectContaining({ type: 'content', delta: 'Hello ' }),
                expect.objectContaining({ type: 'content', delta: 'world' }),
            ])

            const doneChunk = result.find(c => c.type === 'done')
            expect(doneChunk).toBeDefined()
        })
    })
})
