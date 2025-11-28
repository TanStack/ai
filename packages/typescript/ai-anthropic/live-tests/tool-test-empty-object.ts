import { createAnthropic } from '../src/index'
import { z } from 'zod'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

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
  // .env.local not found, will use process.env
}

const apiKey = process.env.ANTHROPIC_API_KEY

if (!apiKey) {
  console.error('❌ ANTHROPIC_API_KEY not found in .env.local')
  process.exit(1)
}

async function testToolWithEmptyObjectSchema() {
  console.log('🚀 Testing Anthropic tool calling with empty object schema\n')

  const adapter = createAnthropic(apiKey)

  // Create a tool with empty object schema (like getGuitars)
  const getGuitarsTool = {
    name: 'getGuitars',
    description: 'Get all products from the database',
    inputSchema: z.object({}),
    execute: async () => {
      console.log('✅ Tool executed successfully')
      return [
        { id: '1', name: 'Guitar 1' },
        { id: '2', name: 'Guitar 2' },
      ]
    },
  }

  const messages = [
    {
      role: 'user' as const,
      content: 'Get me all the guitars',
    },
  ]

  console.log('📤 Sending request with tool:')
  console.log('  Tool name:', getGuitarsTool.name)
  console.log('  Input schema:', getGuitarsTool.inputSchema.toString())
  console.log('  User message:', messages[0].content)
  console.log()

  try {
    console.log('📥 Streaming response...\n')

    let toolCallFound = false
    let toolExecuted = false
    let finalResponse = ''
    let toolCallArguments: string | null = null

    // @ts-ignore - using internal chat method
    const stream = adapter.chatStream({
      model: 'claude-3-5-sonnet-20241022',
      messages,
      tools: [getGuitarsTool],
    })

    for await (const chunk of stream) {
      if (chunk.type === 'tool_call') {
        toolCallFound = true
        toolCallArguments = chunk.toolCall.function.arguments
        console.log('\n🔧 Tool call detected!')
        console.log('  Name:', chunk.toolCall.function.name)
        console.log('  Arguments (raw):', toolCallArguments)
        console.log('  Arguments (type):', typeof toolCallArguments)

        // Validate arguments are not empty string
        if (toolCallArguments === '') {
          console.error('  ❌ ERROR: Arguments are empty string!')
          console.error('  Expected: "{}" or valid JSON')
        } else if (toolCallArguments === '{}') {
          console.log('  ✅ Arguments are correctly normalized to {}')
        }

        // Try to parse if it's a string
        if (typeof toolCallArguments === 'string') {
          try {
            const parsed = JSON.parse(toolCallArguments)
            console.log(
              '  Arguments (parsed):',
              JSON.stringify(parsed, null, 2),
            )
          } catch (e) {
            console.error('  ❌ Failed to parse arguments as JSON:', e)
          }
        }

        // Execute the tool
        if (getGuitarsTool.execute) {
          console.log('\n🔨 Executing tool...')
          try {
            const parsedArgs =
              typeof toolCallArguments === 'string'
                ? JSON.parse(toolCallArguments)
                : toolCallArguments
            const result = await getGuitarsTool.execute(parsedArgs)
            toolExecuted = true
            console.log('  Result:', JSON.stringify(result, null, 2))
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
    console.log(
      '  Arguments not empty string:',
      toolCallArguments !== '' ? '✅' : '❌',
    )
    console.log('  Tool executed:', toolExecuted ? '✅' : '❌')
    console.log('  Final response:', finalResponse || '(none)')
    console.log('='.repeat(60))

    if (!toolCallFound) {
      console.error('\n❌ FAIL: No tool call was detected in the stream')
      process.exit(1)
    }

    if (toolCallArguments === '') {
      console.error(
        '\n❌ FAIL: Tool call arguments are empty string (should be "{}" or valid JSON)',
      )
      process.exit(1)
    }

    if (!toolExecuted) {
      console.error('\n❌ FAIL: Tool was not executed successfully')
      process.exit(1)
    }

    console.log('\n✅ SUCCESS: Tool with empty object schema works correctly!')
    process.exit(0)
  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message)
    if (error.error) {
      console.error('  Error details:', JSON.stringify(error.error, null, 2))
    }
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

testToolWithEmptyObjectSchema()
