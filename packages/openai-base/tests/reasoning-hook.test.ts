import { describe, expect, it } from 'vitest'
import OpenAI from 'openai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import type {
  ModelReasoning,
  ReasoningRequest,
  TextOptions,
} from '@tanstack/ai'

const logger = resolveDebugOption(false)
const client = new OpenAI({ apiKey: 'test-api-key' })

const DATA: ModelReasoning = {
  budget: false,
  map: { off: 'none', minimal: null, medium: null, high: 'high' },
}

class ChatAdapter extends OpenAIBaseChatCompletionsTextAdapter<string> {
  constructor(private readonly data?: ModelReasoning) {
    super('m', 'test', client)
  }
  protected override modelReasoning() {
    return this.data
  }
  request(options: TextOptions) {
    return this.mapOptionsToRequest(options)
  }
}

class ResponsesAdapter extends OpenAIBaseResponsesTextAdapter<string> {
  constructor(private readonly data?: ModelReasoning) {
    super('m', 'test', client)
  }
  protected override modelReasoning() {
    return this.data
  }
  request(options: TextOptions) {
    return this.mapOptionsToRequest(options)
  }
}

function options(reasoning?: ReasoningRequest): TextOptions {
  return {
    model: 'm',
    logger,
    messages: [{ role: 'user', content: 'hi' }],
    ...(reasoning ? { reasoning } : {}),
  }
}

describe('modelReasoning hook: Chat Completions', () => {
  it('sends reasoning_effort, clamped to the model levels', () => {
    const request = new ChatAdapter(DATA).request(
      options({ level: 'medium', summary: true }),
    )
    expect(request).toMatchObject({ reasoning_effort: 'high' })
  })

  it('sends the off value', () => {
    const request = new ChatAdapter(DATA).request(
      options({ level: 'off', summary: true }),
    )
    expect(request).toMatchObject({ reasoning_effort: 'none' })
  })

  it('sends nothing without model data or without a request', () => {
    expect(
      new ChatAdapter().request(options({ level: 'high', summary: true })),
    ).not.toHaveProperty('reasoning_effort')
    expect(new ChatAdapter(DATA).request(options())).not.toHaveProperty(
      'reasoning_effort',
    )
  })
})

describe('modelReasoning hook: Responses', () => {
  it('sends reasoning.effort and a summary', () => {
    const request = new ResponsesAdapter(DATA).request(
      options({ level: 'high', summary: true }),
    )
    expect(request.reasoning).toEqual({ effort: 'high', summary: 'auto' })
  })

  it('sends no summary when summary is false or the level is off', () => {
    expect(
      new ResponsesAdapter(DATA).request(
        options({ level: 'high', summary: false }),
      ).reasoning,
    ).toEqual({ effort: 'high' })
    expect(
      new ResponsesAdapter(DATA).request(
        options({ level: 'off', summary: true }),
      ).reasoning,
    ).toEqual({ effort: 'none' })
  })

  it('sends nothing without model data', () => {
    expect(
      new ResponsesAdapter().request(options({ level: 'high', summary: true })),
    ).not.toHaveProperty('reasoning')
  })
})
