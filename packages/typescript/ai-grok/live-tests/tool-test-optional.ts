import { toolDefinition } from '@tanstack/ai'
import { assert, findToolCallEnd, loadApiKey, streamChat } from './helpers'
import type { StreamChunk } from '@tanstack/ai'

const apiKey = loadApiKey()

async function testToolOptionalParams() {
  console.log('Testing Grok tool calling with optional parameters (Responses API)\n')

  const getTemperature = toolDefinition({
    name: 'get_temperature',
    description:
      'Get the current temperature for a location. Unit defaults to fahrenheit if not specified.',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'The city to check' },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature unit (optional)',
        },
      },
      required: ['location'],
      additionalProperties: false,
    } as const,
  }).server((args: unknown) => {
    const { location, unit } = args as {
      location: string
      unit?: 'celsius' | 'fahrenheit'
    }
    const u = unit || 'fahrenheit'
    console.log(
      `  Tool executed: location="${location}", unit="${u}" (${unit ? 'provided' : 'defaulted'})`,
    )
    return `The temperature in ${location} is 72 ${u === 'celsius' ? 'C' : 'F'}`
  })

  const chunks: Array<StreamChunk> = []
  for await (const chunk of streamChat({
    model: 'grok-4.3',
    apiKey,
    messages: [
      {
        role: 'user',
        content: 'What is the temperature in Paris? Use get_temperature.',
      },
    ],
    tools: [getTemperature],
    maxTokens: 256,
  })) {
    chunks.push(chunk)
  }

  const toolEnd = findToolCallEnd(chunks)
  assert(!!toolEnd, 'No TOOL_CALL_END event found')

  const input = toolEnd.input as { location?: unknown }
  assert(
    typeof input.location === 'string',
    `Expected location string, got: ${JSON.stringify(input)}`,
  )
  console.log(`  Tool args: ${JSON.stringify(input)}`)

  console.log('\nPASS: tool calling with optional parameters')
}

testToolOptionalParams().catch((error) => {
  console.error('ERROR:', error.message)
  process.exit(1)
})
