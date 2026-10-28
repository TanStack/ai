import { describe, expect, it } from 'vitest'
import { renderCatalog, sortSkills } from '../src/catalog'
import type { SkillMetadata } from '../src/types'

const skills: Array<SkillMetadata> = [
  { name: 'zeta', description: 'last' },
  { name: 'alpha', description: 'first & <special>' },
]

describe('renderCatalog', () => {
  it('sorts by name deterministically', () => {
    expect(sortSkills(skills).map((s) => s.name)).toEqual(['alpha', 'zeta'])
  })

  it('renders Anthropic XML with escaped content', () => {
    const out = renderCatalog(skills, 'anthropic')
    expect(out.startsWith('<available_skills>')).toBe(true)
    expect(out.indexOf('name="alpha"')).toBeLessThan(out.indexOf('name="zeta"'))
    expect(out).toContain('first &amp; &lt;special&gt;')
  })

  it('escapes quotes in Anthropic XML attributes', () => {
    const out = renderCatalog(
      [{ name: 'alpha', description: 'say "hi" & go' }],
      'anthropic',
    )
    expect(out).toContain('say &quot;hi&quot; &amp; go')
  })

  it('renders markdown for non-Anthropic families', () => {
    const out = renderCatalog(skills, 'openai')
    expect(out).toContain('## Available skills')
    expect(out).toContain('- **alpha**: first & <special>')
  })

  it('is stable across calls (cache-friendly)', () => {
    expect(renderCatalog(skills, 'anthropic')).toBe(
      renderCatalog(skills, 'anthropic'),
    )
  })
})
