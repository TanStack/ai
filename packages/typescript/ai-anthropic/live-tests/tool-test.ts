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

async function testToolCallingWithArguments() {
  console.log('🚀 Testing Anthropic tool calling with required arguments\n')

  const adapter = createAnthropic(apiKey)

  // Create a tool that requires arguments (like recommendGuitar)
  const recommendGuitarTool = {
    name: 'recommendGuitar',
    description:
      'REQUIRED tool to display a guitar recommendation to the user. This tool MUST be used whenever recommending a guitar - do NOT write recommendations yourself. This displays the guitar in a special appealing format with a buy button.',
    inputSchema: z.object({
      id: z
        .string()
        .describe(
          'The ID of the guitar to recommend (from the getGuitars results)',
        ),
    }),
    execute: async (args: any) => {
      console.log(
        '✅ Tool executed with arguments:',
        JSON.stringify(args, null, 2),
      )

      // Validate arguments were passed correctly
      if (!args) {
        console.error('❌ ERROR: Arguments are undefined!')
        return 'Error: No arguments received'
      }

      if (typeof args !== 'object') {
        console.error('❌ ERROR: Arguments are not an object:', typeof args)
        return 'Error: Invalid arguments type'
      }

      if (!args.id) {
        console.error('❌ ERROR: ID argument is missing!')
        return 'Error: ID is required'
      }

      console.log(`  - id: "${args.id}" (type: ${typeof args.id})`)

      return `Recommended guitar with ID: ${args.id}`
    },
  }

  const messages = [
    {
      role: 'user' as const,
      content: 'Recommend guitar ID 1 to me',
    },
  ]

  console.log('📤 Sending request with tool:')
  console.log('  Tool name:', recommendGuitarTool.name)
  console.log('  Input schema:', recommendGuitarTool.inputSchema.toString())
  console.log('  User message:', messages[0].content)
  console.log()

  try {
    console.log('📥 Streaming response...\n')

    let toolCallFound = false
    let toolCallArguments: string | null = null
    let toolExecuted = false
    let finalResponse = ''

    // @ts-ignore - using internal chat method
    const stream = adapter.chatStream({
      model: 'claude-3-5-sonnet-20241022',
      messages,
      tools: [recommendGuitarTool],
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
          console.error('  Expected: Valid JSON with required parameters')
        }

        // Try to parse if it's a string
        if (typeof toolCallArguments === 'string') {
          try {
            const parsed = JSON.parse(toolCallArguments)
            console.log(
              '  Arguments (parsed):',
              JSON.stringify(parsed, null, 2),
            )
            toolCallArguments = parsed as any
          } catch (e) {
            console.error('  ❌ Failed to parse arguments as JSON:', e)
          }
        }

        // Execute the tool
        if (recommendGuitarTool.execute) {
          console.log('\n🔨 Executing tool...')
          try {
            const parsedArgs =
              typeof toolCallArguments === 'string'
                ? JSON.parse(toolCallArguments)
                : toolCallArguments
            const result = await recommendGuitarTool.execute(parsedArgs)
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
    console.log(
      '  Arguments not empty string:',
      toolCallArguments !== '' ? '✅' : '❌',
    )
    console.log('  Tool executed:', toolExecuted ? '✅' : '❌')
    console.log('  Final response:', finalResponse)
    console.log('='.repeat(60))

    if (!toolCallFound) {
      console.error('\n❌ FAIL: No tool call was detected in the stream')
      process.exit(1)
    }

    if (toolCallArguments === '') {
      console.error(
        '\n❌ FAIL: Tool call arguments are empty string (should be valid JSON)',
      )
      process.exit(1)
    }

    if (typeof toolCallArguments === 'string') {
      try {
        const parsed = JSON.parse(toolCallArguments)
        if (!parsed.id) {
          console.error('\n❌ FAIL: ID parameter is missing from arguments')
          process.exit(1)
        }
      } catch (e) {
        console.error('\n❌ FAIL: Tool arguments are not valid JSON')
        process.exit(1)
      }
    } else if (toolCallArguments && typeof toolCallArguments === 'object') {
      if (!toolCallArguments.id) {
        console.error('\n❌ FAIL: ID parameter is missing from arguments')
        process.exit(1)
      }
    }

    if (!toolExecuted) {
      console.error('\n❌ FAIL: Tool was not executed successfully')
      process.exit(1)
    }

    console.log('\n✅ SUCCESS: Tool calling with arguments works correctly!')
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

testToolCallingWithArguments()
