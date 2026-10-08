import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { LovableTextAdapter } from '../src/adapters/text'
import { LovableResponsesTextAdapter } from '../src/adapters/responses-text'
import type { ReasoningRequest, TextOptions } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'google/gemini-3.6-flash'

function options(reasoning: ReasoningRequest | undefined): TextOptions {
  return {
    model,
    logger,
    messages: [{ role: 'user', content: 'hi' }],
    ...(reasoning ? { reasoning } : {}),
  }
}

class ChatProbe extends LovableTextAdapter<typeof model> {
  request(reasoning: ReasoningRequest | undefined) {
    return this.mapOptionsToRequest(options(reasoning))
  }
}

class ResponsesProbe extends LovableResponsesTextAdapter<typeof model> {
  request(reasoning: ReasoningRequest | undefined) {
    return this.mapOptionsToRequest(options(reasoning))
  }
}

describe('Lovable chat({ reasoning }) request shape', () => {
  it('chat: reasoning_effort', () => {
    const chat = new ChatProbe({ apiKey: 'k' }, model)
    expect(chat.request({ level: 'minimal', summary: true })).toMatchObject({
      reasoning_effort: 'minimal',
    })
    expect(chat.request(undefined)).not.toHaveProperty('reasoning_effort')
  })

  it('Responses: reasoning.effort and a summary', () => {
    const responses = new ResponsesProbe({ apiKey: 'k' }, model)
    expect(responses.request({ level: 'high', summary: true })).toMatchObject({
      reasoning: { effort: 'high', summary: 'auto' },
    })
  })
})
