import { describe, expect, it } from 'vitest'
import { parseIssueUrl, parseVerdict } from './sandbox-triage'

describe('parseIssueUrl', () => {
  it('extracts repo + issue number', () => {
    expect(parseIssueUrl('https://github.com/TanStack/ai/issues/123')).toEqual({
      repo: 'TanStack/ai',
      issueNumber: 123,
    })
  })

  it('tolerates a trailing slash, query, and hash', () => {
    expect(
      parseIssueUrl('https://github.com/a/b/issues/7/?x=1#note'),
    ).toEqual({ repo: 'a/b', issueNumber: 7 })
  })

  it('throws on a pull-request URL', () => {
    expect(() =>
      parseIssueUrl('https://github.com/a/b/pull/7'),
    ).toThrow(/issue url/i)
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
