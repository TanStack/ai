import { bedrockText } from '../src/index'
import { z } from 'zod'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { chat } from '@tanstack/ai'

// Load environment variables from .env.local manually
const __dirname = dirname(fileURLToPath(import.meta.url))
try {
    const envContent = readFileSync(join(__dirname, '.env.local'), 'utf-8')
    envContent.split('\n').forEach((line) => {
        const match = line.match(/^([^=]+)=(.*)$/)
        if (match) {
            process.env[match[1].trim()] = match[2].trim()
        }
    })
} catch (e) {
    // .env.local not found
}

function throwMissingEnv(name: string): never {
    throw new Error(`Missing required environment variable: ${name}`)
}

async function testBedrockNovaToolCalling() {
    console.log('Testing Bedrock tool calling (Amazon Nova Pro)\n')

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? throwMissingEnv('AWS_ACCESS_KEY_ID')
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? throwMissingEnv('AWS_SECRET_ACCESS_KEY')

    const stream = await chat({
        adapter: bedrockText('us.amazon.nova-pro-v1:0', {
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId,
                secretAccessKey,
            }
        }),
        messages: [
            {
                role: 'user',
                content: 'Use the `get_temperature` tool to find the temperature in New York and explain why it is the way it is.',
            },
        ],
        tools: [
            {
                name: 'get_temperature',
                description: 'Get the current temperature for a specific location',
                inputSchema: z.object({
                    location: z.string().describe('The city or location'),
                    unit: z.enum(['celsius', 'fahrenheit']).describe('The temperature unit'),
                }),
                execute: async ({ location, unit }: { location: string; unit: string }) => {
                    console.log(`\n[TOOL Temperature] Fetching for ${location}...`)
                    return {
                        temperature: 45,
                        unit: unit,
                        condition: 'Cloudy',
                    }
                },
            },
        ],
        stream: true,
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

    console.log('--- Test Results ---')
    console.log('Thinking detected:', hasThinking)
    console.log('Tool calls:', toolCallCount)
    console.log('Final content length:', finalContent.length)

    if (!hasThinking) {
        console.warn('Warning: No thinking blocks detected')
    }

    if (finalContent.includes('<thinking>')) {
        console.error('Test failed: Thinking tags found in final content')
        process.exit(1)
    }

    if (!finalContent || finalContent.trim().length === 0) {
        console.error('Test failed: No final content - model should explain the temperature')
        process.exit(1)
    }

    console.log('Test passed')
}

testBedrockNovaToolCalling().catch(console.error)
