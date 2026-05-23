// import 'dotenv/config'
import { bedrockText } from '../src/bedrock-chat'
import { z } from 'zod'
import { chat } from '@tanstack/ai'

async function main() {
    const modelId = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
    console.log(`Running tool test for: ${modelId}`)

    const stream = await chat({
        adapter: bedrockText(modelId, {
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            },
        }),
        modelOptions: {
            thinking: {
                type: 'enabled',
                budget_tokens: 2048
            }
        },
        messages: [
            {
                role: 'user',
                content: 'Use the `get_weather` tool to find the weather in San Francisco and then explain why it is the way it is.',
            },
        ],
        tools: [
            {
                name: 'get_weather',
                description: 'Get the current weather in a location',
                inputSchema: z.object({
                    location: z.string().describe('The city and state, e.g. San Francisco, CA'),
                }),
                execute: async ({ location }) => {
                    console.log(`\n[TOOL Weather] Fetching weather for ${location}...`)
                    return {
                        temperature: 72,
                        unit: 'F',
                        condition: 'Sunny',
                    }
                },
            },
        ],
        stream: true
    })

    let finalContent = ''
    let hasThinking = false
    let toolCallCount = 0
    let doneCount = 0

    console.log('--- Stream Output ---')
    for await (const chunk of stream) {
        if (chunk.type === 'thinking') {
            hasThinking = true
        } else if (chunk.type === 'content') {
            process.stdout.write(chunk.delta)
            finalContent += chunk.delta
        } else if (chunk.type === 'tool_call') {
            toolCallCount++
            console.log('\nTool call:', chunk.toolCall.function.name)
        } else if (chunk.type === 'done') {
            doneCount++
        }
    }

    console.log('--- Test Results ---')
    console.log('Thinking detected:', hasThinking)
    console.log('Tool calls:', toolCallCount)
    console.log('Done events:', doneCount)
    console.log('Final content length:', finalContent.length)

    if (!hasThinking) {
        console.error('Test failed: No thinking blocks detected for Claude 4.5')
        process.exit(1)
    }

    if (toolCallCount === 0) {
        console.error('Test failed: No tool calls detected')
        process.exit(1)
    }

    if (!finalContent || finalContent.trim().length === 0) {
        console.error('Test failed: Final content is empty - model should explain weather after getting tool results')
        process.exit(1)
    }

    if (!finalContent.toLowerCase().includes('72') && !finalContent.toLowerCase().includes('sunny')) {
        console.warn('Warning: Final content does not mention the weather data')
    }

    console.log('Test passed')
}

main().catch(console.error)
