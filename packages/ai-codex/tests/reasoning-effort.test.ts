import { describe, expect, it } from 'vitest'
import { codexReasoningEffort } from '../src/adapters/text'

describe('Codex chat({ reasoning }) effort', () => {
  it('uses the model effort for the level', () => {
    expect(
      codexReasoningEffort(
        'gpt-5.2-codex',
        { level: 'xhigh', summary: true },
        undefined,
      ),
    ).toBe('xhigh')
  })

  it('clamps a level the model does not have', () => {
    // gpt-5.1-codex has no minimal: it clamps up to low.
    expect(
      codexReasoningEffort(
        'gpt-5.1-codex',
        { level: 'minimal', summary: true },
        undefined,
      ),
    ).toBe('low')
  })

  it('falls back to the adapter default without a request', () => {
    expect(codexReasoningEffort('gpt-5.1-codex', undefined, 'high')).toBe(
      'high',
    )
    expect(
      codexReasoningEffort('gpt-5.1-codex', undefined, undefined),
    ).toBeUndefined()
  })
})
