import { describe, expect, it } from 'vitest'
import { isRoutingAlias, rejectRoutingAliases, toModelConstName } from './ids'

describe('isRoutingAlias', () => {
  it('treats a leading tilde as a routing alias', () => {
    expect(isRoutingAlias('~anthropic/claude-haiku-latest')).toBe(true)
  })

  it('does not treat a stable model id as an alias', () => {
    expect(isRoutingAlias('anthropic/claude-opus-4.6')).toBe(false)
  })
})

describe('rejectRoutingAliases', () => {
  it('drops alias ids and keeps stable ids', () => {
    const kept = rejectRoutingAliases([
      { id: '~anthropic/claude-haiku-latest' },
      { id: 'openai/gpt-5.5' },
      { id: 'anthropic/claude-opus-4.6' },
    ])
    expect(kept.map((m) => m.id)).toEqual([
      'openai/gpt-5.5',
      'anthropic/claude-opus-4.6',
    ])
  })
})

describe('toModelConstName', () => {
  it('turns a stable OpenRouter id into a JS identifier', () => {
    expect(toModelConstName('anthropic/claude-opus-4.6')).toBe(
      'ANTHROPIC_CLAUDE_OPUS_4_6',
    )
  })

  it('turns a stripped provider id into a JS identifier', () => {
    expect(toModelConstName('gpt-5.6-luna-pro')).toBe('GPT_5_6_LUNA_PRO')
  })

  it('maps a leading tilde so an OpenRouter alias is a valid JS identifier', () => {
    expect(toModelConstName('~anthropic/claude-haiku-latest')).toBe(
      '_ANTHROPIC_CLAUDE_HAIKU_LATEST',
    )
  })

  it('fails loud when the id cannot become a JS identifier', () => {
    expect(() => toModelConstName('openai/gpt-5.5!')).toThrow(
      /valid JS identifier/i,
    )
  })
})
