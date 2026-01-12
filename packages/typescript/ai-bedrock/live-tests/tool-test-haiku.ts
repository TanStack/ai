// import 'dotenv/config'
import { bedrockText } from '../src/bedrock-chat'
import { z } from 'zod'
import { chat } from '@tanstack/ai'

function throwMissingEnv(name: string): never {
    throw new Error(`Missing required environment variable: ${name}`)
}

async function main() {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? throwMissingEnv('AWS_ACCESS_KEY_ID')
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? throwMissingEnv('AWS_SECRET_ACCESS_KEY')

    const modelId = 'anthropic.claude-haiku-4-5-20251001-v1:0'
    console.log(`Running tool test for: ${modelId}`)

    const stream = await chat({
        adapter: bedrockText(modelId, {
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        }),
        modelOptions: {
            thinking: {
                type: 'enabled',
                budget_tokens: 1024
            }
        },
        messages: [
            {
                role: 'user',
                content: 'Use the `get_weather` tool to find the weather in New York and explain it.',
            },
        ],
        tools: [
            {
                name: 'get_weather',
                description: 'Get the current weather in a location',
                inputSchema: z.object({
                    location: z.string().describe('The city and state, e.g. New York, NY'),
                }),
                execute: async ({ location }) => {
                    console.log(`\n[TOOL Weather] Fetching weather for ${location}...`)
                    return {
                        temperature: 45,
                        unit: 'F',
                        condition: 'Cloudy',
                    }
                },
            },
        ],
        stream: true
    })

    let finalContent = ''
    let hasThinking = false
    let toolCallCount = 0

    console.log('--- Stream Output ---')
    for await (const chunk of stream) {
        if (chunk.type === 'thinking') {
            hasThinking = true
        } else if (chunk.type === 'content') {
            process.stdout.write(chunk.delta)
            finalContent += chunk.delta
        } else if (chunk.type === 'tool_call') {
            toolCallCount++
        }
    }

    console.log('--- Results ---')
    console.log('Thinking:', hasThinking)
    console.log('Tool calls:', toolCallCount)
    console.log('Content length:', finalContent.length)

    if (!finalContent || finalContent.trim().length === 0) {
        console.error('Test failed: No final content')
        process.exit(1)
    }

    console.log('Test passed')
}

main().catch(console.error)
