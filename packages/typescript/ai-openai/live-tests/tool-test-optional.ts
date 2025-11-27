import { createOpenAI } from '../src/index'
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

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  console.error('❌ OPENAI_API_KEY not found in .env.local')
  process.exit(1)
}

async function testToolWithOptionalParameters() {
  console.log('🚀 Testing OpenAI tool calling with OPTIONAL parameters\n')

  const adapter = createOpenAI(apiKey)

  // Create a tool with optional parameters (unit is optional)
  const getTemperatureTool = {
    type: 'function' as const,
    function: {
      name: 'get_temperature',
      description: 'Get the current temperature for a specific location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city or location to get the temperature for',
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description:
              'The temperature unit (optional, defaults to fahrenheit)',
          },
        },
        required: ['location'], // unit is optional
      },
    },
    execute: async (args: any) => {
      console.log(
        '✅ Tool executed with arguments:',
        JSON.stringify(args, null, 2),
      )

      if (!args || !args.location) {
        console.error('❌ ERROR: Location argument is missing!')
        return 'Error: Location is required'
      }

      const unit = args.unit || 'fahrenheit'
      console.log(`  - location: "${args.location}"`)
      console.log(
        `  - unit: "${unit}" (${args.unit ? 'provided' : 'defaulted'})`,
      )

      return `The temperature in ${args.location} is 72°${unit === 'celsius' ? 'C' : 'F'}`
    },
  }

  const messages = [
    {
      role: 'user' as const,
      content:
        'What is the temperature in Paris? Use the get_temperature tool.',
    },
  ]

  console.log('📤 Sending request with tool:')
  console.log('  Tool name:', getTemperatureTool.function.name)
  console.log(
    '  Required params:',
    getTemperatureTool.function.parameters.required,
  )
  console.log('  Optional params:', ['unit'])
  console.log('  User message:', messages[0].content)
  console.log()

  try {
    console.log('📥 Streaming response...\n')

    let toolCallFound = false
    let toolCallArguments: any = null
    let toolExecuted = false
    let finalResponse = ''

    // @ts-ignore - using internal chat method
    const stream = adapter.chatStream({
      model: 'gpt-4o-mini',
      messages,
      tools: [getTemperatureTool],
    })

    for await (const chunk of stream) {
      if (chunk.type === 'tool_call') {
        toolCallFound = true
        toolCallArguments = chunk.toolCall.function.arguments
        console.log('🔧 Tool call detected!')
        console.log('  Name:', chunk.toolCall.function.name)
        console.log('  Arguments (raw):', toolCallArguments)

        // Parse if it's a string
        if (typeof toolCallArguments === 'string') {
          try {
            const parsed = JSON.parse(toolCallArguments)
            toolCallArguments = parsed
          } catch (e) {
            console.error('  ❌ Failed to parse arguments:', e)
          }
        }

        // Execute the tool
        if (getTemperatureTool.execute) {
          console.log('\n🔨 Executing tool...')
          try {
            const result = await getTemperatureTool.execute(toolCallArguments)
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
    console.log('  Tool executed:', toolExecuted ? '✅' : '❌')
    console.log(
      '  Location provided:',
      toolCallArguments?.location ? '✅' : '❌',
    )
    console.log('='.repeat(60))

    if (!toolCallFound) {
      console.error('\n❌ FAIL: No tool call was detected')
      process.exit(1)
    }

    if (!toolCallArguments || !toolCallArguments.location) {
      console.error('\n❌ FAIL: Tool arguments missing or invalid')
      process.exit(1)
    }

    if (!toolExecuted) {
      console.error('\n❌ FAIL: Tool was not executed successfully')
      process.exit(1)
    }

    console.log(
      '\n✅ SUCCESS: Tool calling with optional parameters works correctly!',
    )
    process.exit(0)
  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

testToolWithOptionalParameters()
