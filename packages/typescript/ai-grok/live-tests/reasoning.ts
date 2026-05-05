import { assert, loadApiKey, streamChat } from './helpers'
import type { StreamChunk } from '@tanstack/ai'

type RawReasoningItem = {
  type?: string
  encrypted_content?: unknown
}

type RawResponse = {
  output: Array<RawReasoningItem>
}

const apiKey = loadApiKey()

async function testReasoning() {
  console.log('Testing Grok reasoning events + encrypted content (Responses API)\n')

  const chunks: Array<StreamChunk> = []
  for await (const chunk of streamChat({
    model: 'grok-4.3',
    apiKey,
    messages: [
      {
        role: 'user',
        content: '3 + 4 * 2 = ? Show your step-by-step reasoning.',
      },
    ],
    maxTokens: 256,
  })) {
    chunks.push(chunk)
  }

  const types = chunks.map((chunk) => String(chunk.type))
  const reasoningEvents = types.filter(
    (type) => type === 'REASONING_MESSAGE_CONTENT',
  )

  if (reasoningEvents.length > 0) {
    console.log(
      `PASS: REASONING events emitted (${reasoningEvents.length} content chunks)`,
    )

    const reasoningStartIdx = types.indexOf('REASONING_START')
    const reasoningEndIdx = types.indexOf('REASONING_END')
    assert(reasoningStartIdx > -1, 'REASONING_START not found')
    assert(
      reasoningEndIdx > reasoningStartIdx,
      'REASONING_END should come after REASONING_START',
    )

    const textStartIdx = types.indexOf('TEXT_MESSAGE_START')
    if (textStartIdx > -1) {
      assert(
        reasoningEndIdx < textStartIdx,
        'REASONING_END should come before TEXT_MESSAGE_START',
      )
      console.log('PASS: Reasoning closes before text starts')
    }
  } else {
    console.log('SKIP: No REASONING events this turn (model discretion)')
  }

  console.log('\nVerifying encrypted_content via raw API call...')
  const resp = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-4.3',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Is 7 prime? Brief.' }],
        },
      ],
      store: false,
      include: ['reasoning.encrypted_content'],
      max_output_tokens: 128,
      stream: false,
    }),
  })

  const rawBody = await resp.text()
  assert(resp.ok, `API returned ${resp.status}: ${rawBody.slice(0, 200)}`)

  const raw = JSON.parse(rawBody) as RawResponse
  const reasoning = raw.output.filter((item) => item.type === 'reasoning')
  const withBlob = reasoning.filter(
    (item) =>
      typeof item.encrypted_content === 'string' &&
      item.encrypted_content.length > 0,
  )

  if (reasoning.length === 0) {
    console.log('SKIP: No reasoning items in raw response (model discretion)')
  } else if (withBlob.length === 0) {
    console.error(
      `FAIL: ${reasoning.length} reasoning items but none had encrypted_content`,
    )
    process.exit(1)
  } else {
    const [first] = withBlob
    assert(typeof first?.encrypted_content === 'string', 'Missing blob')
    console.log(
      `PASS: encrypted_content present (${withBlob.length}/${reasoning.length} items, blob_len=${first.encrypted_content.length})`,
    )
  }
}

testReasoning().catch((error) => {
  console.error('ERROR:', error.message)
  process.exit(1)
})
