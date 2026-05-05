import { toolDefinition } from '@tanstack/ai'
import {
  assert,
  findToolCallEnd,
  findToolCallStart,
  loadApiKey,
  streamChat,
  textFromChunks,
} from './helpers'
import type { StreamChunk } from '@tanstack/ai'

const apiKey = loadApiKey()

async function testToolCalling() {
  console.log('Testing Grok tool calling with required parameters (Responses API)\n')

  const getTemperature = toolDefinition({
    name: 'get_temperature',
    description: 'Get the current temperature for a specific location',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'The city to check' },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature unit',
        },
      },
      required: ['location', 'unit'],
      additionalProperties: false,
    } as const,
  }).server((args: unknown) => {
    const { location, unit } = args as {
      location: string
      unit: 'celsius' | 'fahrenheit'
    }
    console.log(`  Tool executed: location="${location}", unit="${unit}"`)
    return `The temperature in ${location} is 72 ${unit === 'celsius' ? 'C' : 'F'}`
  })

  const chunks: Array<StreamChunk> = []
  for await (const chunk of streamChat({
    model: 'grok-4.3',
    apiKey,
    messages: [
      {
        role: 'user',
        content:
          'What is the temperature in San Francisco in fahrenheit? Use get_temperature.',
      },
    ],
    tools: [getTemperature],
    maxTokens: 256,
  })) {
    chunks.push(chunk)
  }

  const toolStart = findToolCallStart(chunks)
  assert(!!toolStart, 'No TOOL_CALL_START event found')
  console.log(`  Tool name: ${toolStart.toolName}`)

  const toolEnd = findToolCallEnd(chunks)
  assert(!!toolEnd, 'No TOOL_CALL_END event found')

  const input = toolEnd.input as { location?: unknown }
  assert(
    typeof input.location === 'string',
    `Expected location string, got: ${JSON.stringify(input)}`,
  )
  console.log(`  Tool args: ${JSON.stringify(input)}`)

  const text = textFromChunks(chunks)
  console.log(`  Final response: "${text.trim().slice(0, 80)}"`)

  console.log('\nPASS: tool calling with required parameters')
}

testToolCalling().catch((error) => {
  console.error('ERROR:', error.message)
  process.exit(1)
})
