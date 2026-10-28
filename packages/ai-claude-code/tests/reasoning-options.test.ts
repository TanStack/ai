import { describe, expect, it } from 'vitest'
import { claudeCodeReasoning } from '../src/adapters/text'

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
