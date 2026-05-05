import {
  assert,
  findRunFinished,
  loadApiKey,
  streamChat,
  textFromChunks,
} from './helpers'
import type { StreamChunk } from '@tanstack/ai'

const apiKey = loadApiKey()

async function testBasicStreaming() {
  console.log('Testing Grok basic streaming (Responses API)\n')

  const chunks: Array<StreamChunk> = []
  for await (const chunk of streamChat({
    model: 'grok-4.3',
    apiKey,
    messages: [{ role: 'user', content: 'Reply with exactly: hello' }],
    maxTokens: 32,
  })) {
    chunks.push(chunk)
  }

  const types = new Set(chunks.map((chunk) => String(chunk.type)))
  const required = [
    'RUN_STARTED',
    'TEXT_MESSAGE_START',
    'TEXT_MESSAGE_CONTENT',
    'TEXT_MESSAGE_END',
    'RUN_FINISHED',
  ]
  const missing = required.filter((type) => !types.has(type))
  assert(
    missing.length === 0,
    `Missing AG-UI events: ${missing.join(', ')}\nSeen: ${[...types].join(', ')}`,
  )

  const text = textFromChunks(chunks)
  assert(
    text.toLowerCase().includes('hello'),
    `Expected "hello" in response, got: ${text.slice(0, 80)}`,
  )

  const finished = findRunFinished(chunks)
  assert(!!finished, 'Missing RUN_FINISHED event')
  assert(!!finished.usage, 'Missing usage')
  assert(finished.usage.promptTokens > 0, 'Missing usage.promptTokens')
  assert(finished.usage.completionTokens > 0, 'Missing usage.completionTokens')
  assert(
    finished.finishReason === 'stop',
    `Expected finishReason=stop, got: ${finished.finishReason}`,
  )

  console.log(`PASS: streaming`)
  console.log(`  Response: "${text.trim().slice(0, 60)}"`)
  console.log(`  Usage: ${JSON.stringify(finished.usage)}`)
  console.log(`  Events: ${chunks.length} chunks, ${types.size} unique types`)
}

testBasicStreaming().catch((error) => {
  console.error('ERROR:', error.message)
  process.exit(1)
})
