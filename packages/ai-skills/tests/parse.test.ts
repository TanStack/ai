import { describe, expect, it } from 'vitest'
import { SkillParseError, parseSkill, stripFrontmatter } from '../src/parse'

const md = (fm: string, body = '# Body\ntext') => `---\n${fm}\n---\n${body}`

describe('parseSkill', () => {
  it('parses a simple flat frontmatter', () => {
    const r = parseSkill(md('name: alpha\ndescription: does a thing'), {
      dirName: 'alpha',
    })
    expect(r.metadata.name).toBe('alpha')
    expect(r.metadata.description).toBe('does a thing')
    expect(r.warnings).toEqual([])
    expect(r.body).toBe('# Body\ntext')
  })

  it('handles an unquoted colon in the description (single pass, no retry)', () => {
    const r = parseSkill(md('name: a\ndescription: Ratio is 2:1 always'), {
      dirName: 'a',
    })
    expect(r.metadata.description).toBe('Ratio is 2:1 always')
  })

  it('parses a folded block-scalar description', () => {
    const r = parseSkill(
      md('name: a\ndescription: >\n  line one\n  line two'),
      { dirName: 'a' },
    )
    expect(r.metadata.description).toBe('line one line two')
  })

  it('parses list + map frontmatter fields', () => {
    const r = parseSkill(
      md(
        'name: a\ndescription: d\nallowedTools: [read, write]\nmetadata:\n  team: core',
      ),
      { dirName: 'a' },
    )
    expect(r.metadata.allowedTools).toEqual(['read', 'write'])
    expect(r.metadata.metadata).toEqual({ team: 'core' })
  })

  it('warns (but loads) on name/dir mismatch and >64 char names', () => {
    const r = parseSkill(md('name: alpha\ndescription: d'), { dirName: 'beta' })
    expect(r.metadata.name).toBe('alpha')
    expect(r.warnings.map((w) => w.code)).toContain('name-dir-mismatch')
  })

  it('throws in strict mode when a warning would fire', () => {
    expect(() =>
      parseSkill(md('name: alpha\ndescription: d'), {
        dirName: 'beta',
        strict: true,
      }),
    ).toThrow(SkillParseError)
  })

  it('skips (throws) when description is missing or there is no frontmatter', () => {
    expect(() => parseSkill(md('name: alpha'), { dirName: 'alpha' })).toThrow(
      SkillParseError,
    )
    expect(() => parseSkill('# just a heading')).toThrow(SkillParseError)
  })
})

describe('stripFrontmatter', () => {
  it('removes the frontmatter block', () => {
    expect(stripFrontmatter(md('name: a\ndescription: d', 'hello'))).toBe(
      'hello',
    )
  })
  it('returns the input trimmed when there is no frontmatter', () => {
    expect(stripFrontmatter('  no fm  ')).toBe('no fm')
  })
})
