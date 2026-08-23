import { describe, expect, it } from 'vitest'
import { validateSkill } from '../src/validate'

describe('validateSkill', () => {
  it('passes a clean portable skill by default', () => {
    expect(
      validateSkill({ name: 'my-skill', description: 'ok' }).ok,
    ).toBe(true)
  })

  it('flags invalid portable names', () => {
    const r = validateSkill({ name: 'My_Skill', description: 'x' })
    expect(r.ok).toBe(false)
    expect(r.issues[0]?.target).toBe('portable')
  })

  it('flags Anthropic reserved names and XML tags', () => {
    const r = validateSkill(
      { name: 'claude-helper', description: 'has <b>tag</b>' },
      { targets: ['anthropic'] },
    )
    const messages = r.issues.map((i) => i.message).join(' ')
    expect(messages).toContain('anthropic')
    expect(messages).toContain('XML')
  })
})
