import { describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { z } from 'zod'
import { AnthropicTextAdapter, createAnthropicChatWithClient } from '../src'
import type { ModelReasoning, ReasoningRequest, Tool } from '@tanstack/ai'
import type { AnthropicChatModel } from '../src/model-meta'

const logger = resolveDebugOption(false)

function textStream(text: string) {
  return (async function* () {
    yield {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }
    yield {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    }
    yield { type: 'content_block_stop', index: 0 }
    yield {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 5 },
    }
    yield { type: 'message_stop' }
  })()
}

const lookup: Tool = {
  name: 'lookup',
  description: 'Look up a word',
  inputSchema: z.object({ word: z.string() }),
}

/** Run one call and return the request body it sent. */
async function send(
  model: AnthropicChatModel,
  reasoning: ReasoningRequest | undefined,
  extra: { tools?: Array<Tool>; modelOptions?: Record<string, unknown> } = {},
) {
  const create = vi.fn().mockResolvedValue(textStream('ok'))
  const adapter = createAnthropicChatWithClient(model, {
    beta: { messages: { create } },
  })
  for await (const _chunk of adapter.chatStream({
    logger,
    model,
    messages: [{ role: 'user', content: 'hi' }],
    ...(reasoning ? { reasoning } : {}),
    ...(extra.tools ? { tools: extra.tools } : {}),
    ...(extra.modelOptions ? { modelOptions: extra.modelOptions } : {}),
  })) {
    // Drain the stream.
  }
  const [body] = create.mock.calls[0] ?? []
  return body as Record<string, any>
}

const on = (level: ReasoningRequest['level']): ReasoningRequest => ({
  level,
  summary: true,
})

describe('Anthropic chat({ reasoning }) request shape', () => {
  it('sends no thinking fields without a reasoning request', async () => {
    const body = await send('claude-opus-5-5', undefined)
    expect(body).not.toHaveProperty('thinking')
    expect(body).not.toHaveProperty('effort')
    expect(body).not.toHaveProperty('output_config')
  })

  it('adaptive models: adaptive thinking with output_config.effort', async () => {
    const body = await send('claude-opus-5-5', on('xhigh'))
    expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' })
    expect(body.output_config).toEqual({ effort: 'xhigh' })
    expect(body).not.toHaveProperty('effort')
  })

  it('omits the thinking text when summary is false', async () => {
    const body = await send('claude-opus-5-5', {
      level: 'high',
      summary: false,
    })
    expect(body.thinking).toEqual({ type: 'adaptive', display: 'omitted' })
  })

  it('Claude 4.6: the effort is a top-level field', async () => {
    const body = await send('claude-opus-4-6', on('max'))
    expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' })
    expect(body.effort).toBe('max')
    expect(body).not.toHaveProperty('output_config')
  })

  it('Claude 4.6 with budgetTokens: budget thinking', async () => {
    const body = await send('claude-opus-4-6', {
      level: 'high',
      summary: true,
      budgetTokens: 5000,
    })
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 5000 })
    expect(body).not.toHaveProperty('effort')
  })

  it('Claude Opus 4.5: effort levels but no adaptive thinking, so a budget', async () => {
    const body = await send('claude-opus-4-5', on('medium'))
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 })
    expect(body).not.toHaveProperty('output_config')
  })

  it('budget models: the level picks the budget, and max_tokens grows past it', async () => {
    const body = await send('claude-haiku-4-5', on('medium'), {
      modelOptions: { max_tokens: 4000 },
    })
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 })
    expect(body.max_tokens).toBe(8193)
  })

  it('budget thinking with tools turns on the interleaved-thinking beta', async () => {
    const body = await send('claude-haiku-4-5', on('low'), { tools: [lookup] })
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 2048 })
    expect(body.betas).toContain('interleaved-thinking-2025-05-14')
  })

  it('off disables thinking', async () => {
    const body = await send('claude-sonnet-5', on('off'))
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body).not.toHaveProperty('output_config')
  })

  it('clamps a level the model does not have', async () => {
    // claude-opus-4-8 has no `minimal`: it clamps up to `low`.
    const minimal = await send('claude-opus-4-8', on('minimal'))
    expect(minimal.output_config).toEqual({ effort: 'low' })
    // claude-fable-5 cannot stop thinking: `off` clamps up to `low`.
    const off = await send('claude-fable-5', on('off'))
    expect(off.thinking).toEqual({ type: 'adaptive', display: 'summarized' })
    expect(off.output_config).toEqual({ effort: 'low' })
  })

  it('keeps the effort beside the structured-output format', async () => {
    const create = vi
      .fn()
      .mockResolvedValue(textStream(JSON.stringify({ word: 'hi' })))
    const result = await chat({
      adapter: createAnthropicChatWithClient('claude-opus-5-5', {
        beta: { messages: { create } },
      }),
      messages: [{ role: 'user', content: 'hi' }],
      outputSchema: z.object({ word: z.string() }),
      reasoning: 'high',
    })
    expect(result).toEqual({ word: 'hi' })
    const [body] = create.mock.calls[0] ?? []
    expect(body.output_config).toMatchObject({
      effort: 'high',
      format: { type: 'json_schema' },
    })
  })
})

describe('Anthropic reasoning from the config', () => {
  /** Run one call with `reasoning` in the config. Returns the request body. */
  async function sendWith(
    model: string,
    reasoning: ModelReasoning,
    request: ReasoningRequest,
  ) {
    const create = vi.fn().mockResolvedValue(textStream('ok'))
    const adapter = new AnthropicTextAdapter(
      { client: { beta: { messages: { create } } }, reasoning },
      model,
    )
    for await (const _chunk of adapter.chatStream({
      logger,
      model,
      messages: [{ role: 'user', content: 'hi' }],
      reasoning: request,
    })) {
      // Drain the stream.
    }
    const [body] = create.mock.calls[0] ?? []
    return body as Record<string, any>
  }

  const effortMap = {
    off: null,
    minimal: null,
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  }

  it('sends budget thinking for a model id that the table does not have', async () => {
    // Like the catalog record of a gateway id with a token budget.
    const body = await sendWith(
      'anthropic/claude-sonnet-4.6',
      { budget: true },
      on('medium'),
    )
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 })
  })

  it('sends adaptive thinking with the effort from the config map', async () => {
    const body = await sendWith(
      'anthropic.claude-fable-5',
      { map: effortMap, budget: false },
      on('xhigh'),
    )
    expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' })
    expect(body.output_config).toEqual({ effort: 'xhigh' })
  })

  it('sends no thinking field for reasoning: false, also on a known model', async () => {
    const body = await sendWith('claude-opus-5-5', false, on('high'))
    expect(body).not.toHaveProperty('thinking')
    expect(body).not.toHaveProperty('effort')
    expect(body).not.toHaveProperty('output_config')
  })

  it('clamps the level with the config, not with the table', async () => {
    // The table gives claude-opus-4-5 low, medium, and high with a budget.
    // This config has only high and max, and no budget.
    const config: ModelReasoning = {
      map: { minimal: null, low: null, medium: null, high: 'high', max: 'max' },
      budget: false,
    }
    const max = await sendWith('claude-opus-4-5', config, on('max'))
    expect(max.output_config).toEqual({ effort: 'max' })
    const low = await sendWith('claude-opus-4-5', config, on('low'))
    expect(low.output_config).toEqual({ effort: 'high' })
  })
})
