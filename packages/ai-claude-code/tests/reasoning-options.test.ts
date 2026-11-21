import { describe, expect, it } from 'vitest'
import { claudeCodeReasoning } from '../src/adapters/text'
import { CLAUDE_CODE_MODELS, CLAUDE_CODE_MODEL_REASONING } from '../src/model-meta'

describe('Claude Code chat({ reasoning }) CLI settings', () => {
  it('effort models: --effort with the level', () => {
    expect(
      claudeCodeReasoning('claude-opus-4-8', { level: 'xhigh', summary: true }),
    ).toEqual({ args: ['--effort', 'xhigh'], env: {} })
    // claude-opus-4-8 has no minimal: it clamps up to low.
    expect(
      claudeCodeReasoning('opus', { level: 'minimal', summary: true }).args,
    ).toEqual(['--effort', 'low'])
  })

  it('budget models: MAX_THINKING_TOKENS, 0 for off', () => {
    expect(
      claudeCodeReasoning('claude-haiku-4-5', {
        level: 'medium',
        summary: true,
      }),
    ).toEqual({ args: [], env: { MAX_THINKING_TOKENS: '8192' } })
    expect(
      claudeCodeReasoning('haiku', { level: 'off', summary: true }).env,
    ).toEqual({ MAX_THINKING_TOKENS: '0' })
  })

  it('sends nothing without a request', () => {
    expect(claudeCodeReasoning('opus', undefined)).toEqual({
      args: [],
      env: {},
    })
  })
})

describe('Claude 5 models in the reasoning table', () => {
  it.each([
    'claude-opus-5',
    'claude-opus-5-5',
    'claude-sonnet-5',
    'claude-sonnet-5-5',
    'claude-haiku-5-5',
    'claude-fable-5',
    'claude-fable-5-1',
  ])('%s is known and maps reasoning to --effort', (id) => {
    expect(CLAUDE_CODE_MODEL_REASONING[id]).toBeDefined()
    expect(CLAUDE_CODE_MODELS).toContain(id)
    expect(claudeCodeReasoning(id, { level: 'high', summary: true })).toEqual({
      args: ['--effort', 'high'],
      env: {},
    })
  })
})
