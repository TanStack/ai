import { assert, loadApiKey, streamChat, textFromChunks } from './helpers'
import type { StreamChunk } from '@tanstack/ai'

const apiKey = loadApiKey()

async function testMultiTurn() {
  console.log('Testing Grok multi-turn conversation (Responses API)\n')

  const chunks: Array<StreamChunk> = []
  for await (const chunk of streamChat({
    model: 'grok-4.3',
    apiKey,
    messages: [
      { role: 'user', content: 'My name is Alice.' },
      { role: 'assistant', content: 'Nice to meet you, Alice!' },
      { role: 'user', content: 'What is my name?' },
    ],
    maxTokens: 32,
  })) {
    chunks.push(chunk)
  }

  const text = textFromChunks(chunks)

  assert(
    text.toLowerCase().includes('alice'),
    `Expected "alice" in response, got: ${text.slice(0, 80)}`,
  )

  console.log(`PASS: multi-turn conversation`)
  console.log(`  Response: "${text.trim().slice(0, 60)}"`)
}

testMultiTurn().catch((error) => {
  console.error('ERROR:', error.message)
  process.exit(1)
})
