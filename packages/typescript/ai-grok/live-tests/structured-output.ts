import { chat } from '@tanstack/ai'
import { createGrokText } from '../src/index'
import { assert, loadApiKey } from './helpers'

const apiKey = loadApiKey()

type TokyoOutput = {
  name?: unknown
  population?: unknown
  country?: unknown
}

async function testStructuredOutput() {
  console.log('Testing Grok structured output (Responses API)\n')

  const adapter = createGrokText('grok-4.3', apiKey)

  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      population: { type: 'number' },
      country: { type: 'string' },
    },
    required: ['name', 'population', 'country'] as Array<string>,
    additionalProperties: false,
  } as const

  const result = await chat({
    adapter,
    messages: [
      {
        role: 'user',
        content:
          'Return JSON for Tokyo with name, population (approx), and country.',
      },
    ],
    outputSchema: schema,
    maxTokens: 128,
  })

  const data = result as TokyoOutput
  assert(typeof data.name === 'string', `name not string: ${JSON.stringify(data)}`)
  assert(
    typeof data.population === 'number',
    `population not number: ${JSON.stringify(data)}`,
  )
  assert(
    typeof data.country === 'string',
    `country not string: ${JSON.stringify(data)}`,
  )

  console.log(`PASS: structured output`)
  console.log(`  Data: ${JSON.stringify(data)}`)
}

testStructuredOutput().catch((error) => {
  console.error('ERROR:', error.message)
  process.exit(1)
})
