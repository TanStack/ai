import assert from 'node:assert/strict'
import {
  LIVE_RECIPE_SERVER_ERROR,
  app,
  createRecipePrompt,
} from '../src/server/app'

type SmokeMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type SmokeRequestBody = {
  threadId: string
  runId: string
  state: object
  messages: Array<SmokeMessage>
  tools: Array<never>
  context: Array<never>
  forwardedProps: object
}

type SmokeChunk = {
  type: string
  name?: string
  delta?: string
  message?: string
  value?: unknown
}

function createRequestBody({
  threadId,
  runId,
  messages,
}: {
  threadId: string
  runId: string
  messages: Array<SmokeMessage>
}): SmokeRequestBody {
  return {
    threadId,
    runId,
    state: {},
    messages,
    tools: [],
    context: [],
    forwardedProps: {},
  }
}

const followUpRequestBody = createRequestBody({
  threadId: 'thread-smoke-live-follow-up',
  runId: 'run-smoke-live-follow-up',
  messages: [
    {
      id: 'message-smoke-live-follow-up-1',
      role: 'user',
      content: '15-minute veggie dinner from my pantry.',
    },
    {
      id: 'message-smoke-live-follow-up-2',
      role: 'assistant',
      content: 'I can revise the prior recipe using your next instruction.',
    },
    {
      id: 'message-smoke-live-follow-up-3',
      role: 'user',
      content: 'Make it vegan and remove mushrooms. Serve 4 people.',
    },
  ],
})

function assertNoFixtureRecipe(body: string) {
  assert.ok(!body.includes('Pantry Tomato Pasta'))
  assert.ok(!body.includes('15-Minute Veggie Pantry Skillet'))
  assert.ok(!body.includes('High-Protein Pantry Breakfast Skillet'))
  assert.ok(!body.includes('Kid-Friendly 15-Minute Veggie Pantry Skillet'))
  assert.ok(!body.includes('"revision":1'))
}

function readMessageContent(
  message: (typeof followUpRequestBody.messages)[number],
) {
  return message.content
}

function isSmokeChunk(value: unknown): value is SmokeChunk {
  if (!value || typeof value !== 'object') return false
  if (!('type' in value)) return false
  return typeof value.type === 'string'
}

function isRunErrorChunk(value: unknown): value is SmokeChunk & {
  type: 'RUN_ERROR'
  message: string
} {
  return (
    isSmokeChunk(value) &&
    value.type === 'RUN_ERROR' &&
    typeof value.message === 'string'
  )
}

function parseJsonLine(line: string): SmokeChunk {
  const parsed: unknown = JSON.parse(line)
  assert.ok(isSmokeChunk(parsed), `expected stream chunk in line: ${line}`)
  return parsed
}

function parseSseBody(body: string) {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .filter((line) => line && line !== '[DONE]')
    .map(parseJsonLine)
}

async function readErrorChunks(
  path: '/chat/http' | '/chat/sse',
  response: Response,
) {
  const body = await response.text()
  if (path === '/chat/sse') return parseSseBody(body)

  return body.trim().split('\n').filter(Boolean).map(parseJsonLine)
}

async function assertMissingKeyResponse(path: '/chat/http' | '/chat/sse') {
  const originalApiKey = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY

  try {
    const response = await app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(followUpRequestBody),
    })
    const chunks = await readErrorChunks(path, response)
    const error = chunks.find(isRunErrorChunk)

    assert.equal(response.status, 200)
    assert.ok(error)
    assert.match(error.message, new RegExp(LIVE_RECIPE_SERVER_ERROR))
    assertNoFixtureRecipe(JSON.stringify(chunks))
  } finally {
    if (originalApiKey !== undefined) {
      process.env.OPENAI_API_KEY = originalApiKey
    }
  }
}

async function readJsonLines(response: Response) {
  const body = await response.text()
  return body.trim().split('\n').filter(Boolean).map(parseJsonLine)
}

async function maybeAssertLiveOpenAIStream() {
  if (!process.env.OPENAI_API_KEY) return

  const response = await app.request('/chat/http', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(followUpRequestBody),
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/x-ndjson')

  const chunks = await readJsonLines(response)
  const text = JSON.stringify(chunks)
  assert.ok(chunks.some((chunk) => chunk.type === 'RUN_STARTED'))
  assert.ok(chunks.some((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT'))
  assert.ok(chunks.some((chunk) => chunk.type === 'RUN_FINISHED'))
  assert.match(text, /structured-output\.complete|TEXT_MESSAGE_CONTENT/)
  assertNoFixtureRecipe(text)
}

async function main() {
  const health = await app.request('/health')
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { ok: true })

  const recipePrompt = createRecipePrompt(followUpRequestBody.messages)
  assert.equal(recipePrompt.messages.at(-1)?.role, 'user')
  const latestMessage = followUpRequestBody.messages.at(-1)
  assert.ok(latestMessage)
  assert.equal(
    readMessageContent(latestMessage),
    'Make it vegan and remove mushrooms. Serve 4 people.',
  )
  assert.ok(
    followUpRequestBody.messages.some(
      (message) =>
        message.role === 'assistant' && message.content.includes('revise'),
    ),
    'prompt preserves submitted assistant history',
  )
  assert.match(recipePrompt.systemPrompts[0] ?? '', /revise/i)
  assert.match(recipePrompt.systemPrompts[0] ?? '', /conversation history/i)

  await assertMissingKeyResponse('/chat/http')
  await assertMissingKeyResponse('/chat/sse')
  await maybeAssertLiveOpenAIStream()
}

await main()
