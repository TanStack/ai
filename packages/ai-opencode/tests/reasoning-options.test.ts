import { describe, expect, it } from 'vitest'
import { opencodeReasoningOptions } from '../src/adapters/text'
import { OPENCODE_MODEL_REASONING } from '../src/model-meta'

describe('OpenCode chat({ reasoning }) model options', () => {
  it('Claude: thinking with a token budget, disabled for off', () => {
    const reasoning = OPENCODE_MODEL_REASONING['anthropic/claude-sonnet-4-5']
    expect(
      opencodeReasoningOptions(
        'claude-sonnet-4-5',
        { level: 'medium', summary: true },
        reasoning,
      ),
    ).toEqual({ thinking: { type: 'enabled', budgetTokens: 8192 } })
    expect(
      opencodeReasoningOptions(
        'claude-sonnet-4-5',
        { level: 'high', summary: true, budgetTokens: 3000 },
        reasoning,
      ),
    ).toEqual({ thinking: { type: 'enabled', budgetTokens: 3000 } })
    expect(
      opencodeReasoningOptions(
        'claude-sonnet-4-5',
        { level: 'off', summary: true },
        reasoning,
      ),
    ).toEqual({ thinking: { type: 'disabled' } })
  })

  it('other models: reasoningEffort and reasoningSummary', () => {
    expect(
      opencodeReasoningOptions(
        'gpt-5.2',
        { level: 'xhigh', summary: true },
        OPENCODE_MODEL_REASONING['openai/gpt-5.2'],
      ),
    ).toEqual({ reasoningEffort: 'xhigh', reasoningSummary: 'auto' })
  })

  it('sends nothing without a request', () => {
    expect(
      opencodeReasoningOptions(
        'gpt-5.2',
        undefined,
        OPENCODE_MODEL_REASONING['openai/gpt-5.2'],
      ),
    ).toBeUndefined()
  })
})
