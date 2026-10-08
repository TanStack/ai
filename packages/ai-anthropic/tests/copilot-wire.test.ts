import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { anthropicText } from '../src/adapters/text'
import type { FetchWrapper } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'claude-sonnet-5-5'

const sse = [
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} },
  { type: 'message_stop' },
]
  .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  .join('')

let sent: Request | undefined
let sdkBeta: string | null = null
const baseFetch: typeof fetch = async (input, init) => {
  sent = new Request(input, init)
  return new Response(sse, {
    headers: { 'content-type': 'text/event-stream' },
  })
}

// The Copilot wrapper of the docs, for a user turn on the Anthropic route.
const copilot: FetchWrapper = (next) => (input, init) => {
  const headers = new Headers(init?.headers)
  sdkBeta = headers.get('anthropic-beta')
  headers.set('User-Agent', 'my-app/1.0.0')
  headers.set('Openai-Intent', 'conversation-edits')
  headers.set('X-GitHub-Api-Version', '2026-08-01')
  headers.set('X-Interaction-Type', 'conversation-agent')
  headers.set('X-Interaction-Id', 'session-1')
  headers.set('x-initiator', 'user')
  headers.set('anthropic-beta', 'interleaved-thinking-2025-05-14')
  return next(input, { ...init, headers })
}

describe('anthropic on GitHub Copilot', () => {
  it('sends the bearer token and the Copilot headers', async () => {
    const adapter = anthropicText(model, {
      baseURL: 'https://api.githubcopilot.com',
      authToken: 'copilot-token',
      fetch: baseFetch,
    })
    for await (const _ of adapter.chatStream({
      logger,
      model,
      messages: [{ role: 'user', content: 'Hi' }],
      wrapFetch: copilot,
    })) {
      // drain
    }

    expect(sent?.url).toBe(
      'https://api.githubcopilot.com/v1/messages?beta=true',
    )
    expect(sent?.headers.get('authorization')).toBe('Bearer copilot-token')
    expect(sent?.headers.get('x-api-key')).toBe(null)
    expect(sent?.headers.get('user-agent')).toBe('my-app/1.0.0')
    expect(sent?.headers.get('openai-intent')).toBe('conversation-edits')
    expect(sent?.headers.get('x-github-api-version')).toBe('2026-08-01')
    expect(sent?.headers.get('x-interaction-type')).toBe('conversation-agent')
    expect(sent?.headers.get('x-interaction-id')).toBe('session-1')
    expect(sent?.headers.get('x-initiator')).toBe('user')
    expect(sent?.headers.get('anthropic-beta')).toBe(
      'interleaved-thinking-2025-05-14',
    )
    // A custom base URL turns the automatic betas off, and no prompt cache
    // option means no cache markers.
    expect(sdkBeta).toBe(null)
    expect(await sent?.text()).not.toContain('cache_control')
  })
})
