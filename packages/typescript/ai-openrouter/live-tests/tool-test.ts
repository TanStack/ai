import { createOpenRouterText } from '../src/adapters/text'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envContent = readFileSync(join(__dirname, '.env.local'), 'utf-8')
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      process.env[match[1].trim()] = match[2].trim()
    }
  })
} catch (e) {}

const apiKey = process.env.OPENROUTER_API_KEY

if (!apiKey) {
  console.error('❌ OPENROUTER_API_KEY not found in .env.local')
  process.exit(1)
}

async function testToolCallingWithArguments() {
  console.log('🚀 Testing OpenRouter tool calling with arguments\n')

  const adapter = createOpenRouterText('openai/gpt-4o-mini', apiKey!)

  const getTemperatureTool = toolDefinition({
    name: 'get_temperature',
    description: 'Get the current temperature for a specific location',

    inputSchema: z.object({
      location: z
        .string()
        .describe('The city or location to get the temperature for'),
      unit: z.enum(['celsius', 'fahrenheit']).describe('The temperature unit'),
    }),
  }).server(async (args) => {
    console.log(
      '✅ Tool executed with arguments:',
      JSON.stringify(args, null, 2),
    )

    if (!args) {
      console.error('❌ ERROR: Arguments are undefined!')
      return 'Error: No arguments received'
    }

    if (typeof args !== 'object') {
      console.error('❌ ERROR: Arguments are not an object:', typeof args)
      return 'Error: Invalid arguments type'
    }

    if (!args.location) {
      console.error('❌ ERROR: Location argument is missing!')
      return 'Error: Location is required'
    }

    console.log(
      `  - location: "${args.location}" (type: ${typeof args.location})`,
    )
    console.log(`  - unit: "${args.unit}" (type: ${typeof args.unit})`)

    return `The temperature in ${args.location} is 72°${args.unit === 'celsius' ? 'C' : 'F'}`
  })

  const messages = [
    {
      role: 'user' as const,
      content: 'What is the temperature in San Francisco in fahrenheit?',
    },
  ]

  console.log('📤 Sending request with tool:')
  console.log('  Tool name:', getTemperatureTool.name)
  console.log('  User message:', messages[0].content)
  console.log()

  try {
    console.log('📥 Streaming response...\n')

    let toolCallFound = false
    let toolCallArguments: Record<string, unknown> | null = null
    let toolExecuted = false
    let finalResponse = ''

    const stream = adapter.chatStream({
      messages,
      tools: [getTemperatureTool],
    })

    for await (const chunk of stream) {
      console.log('Chunk:', JSON.stringify(chunk, null, 2))

      if (chunk.type === 'tool_call') {
        toolCallFound = true
        const rawArgs = chunk.toolCall.function.arguments
        console.log('\n🔧 Tool call detected!')
        console.log('  Name:', chunk.toolCall.function.name)
        console.log('  Arguments (raw):', rawArgs)
        console.log('  Arguments (type):', typeof rawArgs)

        if (typeof rawArgs === 'string') {
          try {
            const parsed = JSON.parse(rawArgs)
            console.log(
              '  Arguments (parsed):',
              JSON.stringify(parsed, null, 2),
            )
            toolCallArguments = parsed
          } catch (e) {
            console.error('  ❌ Failed to parse arguments as JSON:', e)
          }
        }

        if (toolCallArguments) {
          console.log('\n🔨 Executing tool...')
          try {
            const result = await getTemperatureTool.serverExecute(
              toolCallArguments as {
                location: string
                unit: 'celsius' | 'fahrenheit'
              },
            )
            toolExecuted = true
            console.log('  Result:', result)
          } catch (error) {
            console.error('  ❌ Tool execution error:', error)
          }
        }
      }

      if (chunk.type === 'content') {
        finalResponse += chunk.delta
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('📊 Test Summary:')
    console.log('  Tool call found:', toolCallFound ? '✅' : '❌')
    console.log('  Arguments received:', toolCallArguments ? '✅' : '❌')
    console.log('  Arguments value:', JSON.stringify(toolCallArguments))
    console.log('  Tool executed:', toolExecuted ? '✅' : '❌')
    console.log('  Final response:', finalResponse)
    console.log('='.repeat(60))

    if (!toolCallFound) {
      console.error('\n❌ FAIL: No tool call was detected in the stream')
      process.exit(1)
    }

    if (!toolCallArguments) {
      console.error('\n❌ FAIL: Tool call arguments are missing or null')
      process.exit(1)
    }

    if (typeof toolCallArguments === 'object' && !toolCallArguments.location) {
      console.error('\n❌ FAIL: Location parameter is missing from arguments')
      process.exit(1)
    }

    if (!toolExecuted) {
      console.error('\n❌ FAIL: Tool was not executed successfully')
      process.exit(1)
    }

    console.log('\n✅ SUCCESS: Tool calling with arguments works correctly!')
    process.exit(0)
  } catch (error: unknown) {
    const err = error as { message?: string; stack?: string }
    console.error('\n❌ ERROR:', err.message)
    console.error('Stack:', err.stack)
    process.exit(1)
  }
}

testToolCallingWithArguments()
