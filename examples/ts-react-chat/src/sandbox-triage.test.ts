import { describe, expect, it } from 'vitest'
import {
  HARNESSES,
  PROVIDERS,
  buildTriagePrompt,
  isHarness,
  isProvider,
  missingEnv,
  parseIssueUrl,
  parseVerdict,
} from './sandbox-triage'

describe('parseIssueUrl', () => {
  it('extracts repo + issue number', () => {
    expect(parseIssueUrl('https://github.com/TanStack/ai/issues/123')).toEqual({
      repo: 'TanStack/ai',
      issueNumber: 123,
    })
  })

  it('tolerates a trailing slash, query, and hash', () => {
    expect(parseIssueUrl('https://github.com/a/b/issues/7/?x=1#note')).toEqual({
      repo: 'a/b',
      issueNumber: 7,
    })
  })

  it('throws on a pull-request URL', () => {
    expect(() => parseIssueUrl('https://github.com/a/b/pull/7')).toThrow(
      /issue url/i,
    )
  })

  it('throws on a non-github / malformed URL', () => {
    expect(() => parseIssueUrl('not a url')).toThrow(/issue url/i)
  })
})

describe('parseVerdict', () => {
  it('reads the first VERDICT line, case-insensitive', () => {
    expect(parseVerdict('VERDICT: relevant\n\n## Summary')).toBe('relevant')
    expect(parseVerdict('verdict:  Not-Relevant ')).toBe('not-relevant')
    expect(parseVerdict('Verdict: UNCERTAIN')).toBe('uncertain')
  })

  it('returns null when absent or unrecognized', () => {
    expect(parseVerdict('## Summary\nno verdict here')).toBeNull()
    expect(parseVerdict('VERDICT: maybe')).toBeNull()
  })
})

describe('registries', () => {
  it('has 3 harnesses and 4 providers with labels + required env arrays', () => {
    expect(Object.keys(HARNESSES).sort()).toEqual([
      'claude-code',
      'codex',
      'opencode',
    ])
    expect(Object.keys(PROVIDERS).sort()).toEqual([
      'daytona',
      'docker',
      'local',
      'vercel',
    ])
    for (const spec of Object.values(HARNESSES)) {
      expect(typeof spec.label).toBe('string')
      expect(Array.isArray(spec.requiredEnv)).toBe(true)
    }
  })

  it('guards narrow unknown picker values', () => {
    expect(isHarness('codex')).toBe(true)
    expect(isHarness('nope')).toBe(false)
    expect(isProvider('docker')).toBe(true)
    expect(isProvider(42)).toBe(false)
  })

  it('missingEnv reports unset required vars', () => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.DAYTONA_API_KEY
    expect(missingEnv('claude-code', 'docker')).toContain('ANTHROPIC_API_KEY')
    expect(missingEnv('claude-code', 'daytona')).toEqual(
      expect.arrayContaining(['ANTHROPIC_API_KEY', 'DAYTONA_API_KEY']),
    )
    process.env.ANTHROPIC_API_KEY = 'x'
    expect(missingEnv('claude-code', 'docker')).toEqual([])
  })
})

describe('buildTriagePrompt', () => {
  it('includes the issue + the required VERDICT-line instruction', () => {
    const prompt = buildTriagePrompt(
      { number: 9, title: 'Boom', body: 'crashes on save', url: 'u' },
      'a/b',
    )
    expect(prompt).toContain('#9')
    expect(prompt).toContain('crashes on save')
    expect(prompt).toMatch(/VERDICT:/)
    expect(prompt).toMatch(/relevant \| not-relevant \| uncertain/)
  })
})
