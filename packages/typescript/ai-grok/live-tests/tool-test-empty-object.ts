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

async function testToolEmptyObject() {
  console.log('Testing Grok tool calling with empty object schema (Responses API)\n')

  const getGuitars = toolDefinition({
    name: 'getGuitars',
    description: 'Get all guitars from the catalog',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    } as const,
  }).server(() => {
    console.log('  Tool executed (no arguments)')
    return [
      { id: '1', name: 'Fender Stratocaster', price: 1299 },
      { id: '2', name: 'Gibson Les Paul', price: 2499 },
    ]
  })

  const chunks: Array<StreamChunk> = []
  for await (const chunk of streamChat({
    model: 'grok-4.3',
    apiKey,
    messages: [
      { role: 'user', content: 'List all available guitars. Use getGuitars.' },
    ],
    tools: [getGuitars],
    maxTokens: 512,
  })) {
    chunks.push(chunk)
  }

  const toolStart = findToolCallStart(chunks)
  assert(!!toolStart, 'No TOOL_CALL_START event found')
  assert(
    toolStart.toolName === 'getGuitars',
    `Wrong tool name: ${toolStart.toolName}`,
  )

  const toolEnd = findToolCallEnd(chunks)
  assert(!!toolEnd, 'No TOOL_CALL_END event found')

  const text = textFromChunks(chunks)
  console.log(`  Final response: "${text.trim().slice(0, 80)}"`)

  console.log('\nPASS: tool calling with empty object schema')
}

testToolEmptyObject().catch((error) => {
  console.error('ERROR:', error.message)
  process.exit(1)
})
