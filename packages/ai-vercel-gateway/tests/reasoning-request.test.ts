import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { VercelGatewayTextAdapter } from '../src/adapters/text'
import { VercelGatewayResponsesTextAdapter } from '../src/adapters/responses-text'
import type { ReasoningRequest, TextOptions } from '@tanstack/ai'

const logger = resolveDebugOption(false)

function options(
  model: string,
  reasoning: ReasoningRequest | undefined,
): TextOptions {
  return {
    model,
    logger,
    messages: [{ role: 'user', content: 'hi' }],
    ...(reasoning ? { reasoning } : {}),
  }
}

class ChatProbe extends VercelGatewayTextAdapter<'anthropic/claude-sonnet-4.5'> {
  request(reasoning: ReasoningRequest | undefined) {
    return this.mapOptionsToRequest(options(this.model, reasoning))
  }
}

class ResponsesProbe extends VercelGatewayResponsesTextAdapter<'openai/gpt-5.5'> {
  request(reasoning: ReasoningRequest | undefined) {
    return this.mapOptionsToRequest(options(this.model, reasoning))
  }
}

describe('Vercel AI Gateway chat({ reasoning }) request shape', () => {
  const chat = new ChatProbe({ apiKey: 'k' }, 'anthropic/claude-sonnet-4.5')

  it('chat: the reasoning object with the effort', () => {
    expect(chat.request({ level: 'high', summary: true })).toMatchObject({
      reasoning: { effort: 'high' },
    })
  })

  it('chat: enabled false for off, and exclude when the summary is off', () => {
    expect(chat.request({ level: 'off', summary: true })).toMatchObject({
      reasoning: { enabled: false },
    })
    expect(chat.request({ level: 'low', summary: false })).toMatchObject({
      reasoning: { effort: 'low', exclude: true },
    })
  })

  it('chat: a token budget goes out as max_tokens, without effort', () => {
    const request = chat.request({
      level: 'high',
      summary: true,
      budgetTokens: 2000,
    })
    expect(request).toMatchObject({
      reasoning: { enabled: true, max_tokens: 2000 },
    })
    expect(request).not.toHaveProperty('reasoning.effort')
  })

  it('chat: nothing without a reasoning request', () => {
    expect(chat.request(undefined)).not.toHaveProperty('reasoning')
  })

  it('Responses: reasoning.effort and a summary', () => {
    const responses = new ResponsesProbe({ apiKey: 'k' }, 'openai/gpt-5.5')
    expect(responses.request({ level: 'xhigh', summary: true })).toMatchObject({
      reasoning: { effort: 'xhigh', summary: 'auto' },
    })
  })
})
