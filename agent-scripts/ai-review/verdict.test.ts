import { describe, expect, it } from 'vitest'
import { parseVerdict, reviewLabelFor } from './verdict'

describe('parseVerdict', () => {
  it('parses reject, polish, and ready with an empty issue list', () => {
    expect(parseVerdict({ verdict: 'reject', issues: [] })).toEqual({
      verdict: 'reject',
      issues: [],
    })
    expect(parseVerdict({ verdict: 'polish', issues: [] })).toEqual({
      verdict: 'polish',
      issues: [],
    })
    expect(parseVerdict({ verdict: 'ready', issues: [] })).toEqual({
      verdict: 'ready',
      issues: [],
    })
  })

  it('keeps nits in the issue list with bugs and suggestions', () => {
    expect(
      parseVerdict({
        verdict: 'polish',
        issues: [
          {
            severity: 'bug',
            file: 'src/chat.ts',
            line: 40,
            description: 'null crash on empty messages',
            suggestion: 'return early when messages is empty',
          },
          {
            severity: 'suggestion',
            file: 'src/chat.ts',
            line: 88,
            description: 'missing changeset',
            suggestion: 'add a patch changeset',
          },
          {
            severity: 'nit',
            file: 'src/chat.ts',
            line: 12,
            description: 'extra blank line',
            suggestion: 'delete the blank line',
          },
        ],
      }),
    ).toEqual({
      verdict: 'polish',
      issues: [
        {
          severity: 'bug',
          file: 'src/chat.ts',
          line: 40,
          description: 'null crash on empty messages',
          suggestion: 'return early when messages is empty',
        },
        {
          severity: 'suggestion',
          file: 'src/chat.ts',
          line: 88,
          description: 'missing changeset',
          suggestion: 'add a patch changeset',
        },
        {
          severity: 'nit',
          file: 'src/chat.ts',
          line: 12,
          description: 'extra blank line',
          suggestion: 'delete the blank line',
        },
      ],
    })
  })

  it('throws when verdict is missing', () => {
    expect(() => parseVerdict({ issues: [] })).toThrow(/missing verdict/)
  })

  it('throws on unknown severity', () => {
    expect(() =>
      parseVerdict({
        verdict: 'ready',
        issues: [
          {
            severity: 'critical',
            file: 'src/chat.ts',
            line: 1,
            description: 'too hot',
            suggestion: 'cool it down',
          },
        ],
      }),
    ).toThrow(/unknown severity/)
  })
})

describe('reviewLabelFor', () => {
  it('maps reject, ready, and polish to bot labels', () => {
    expect(reviewLabelFor('reject', false)).toBe('ai-rejected')
    expect(reviewLabelFor('reject', true)).toBe('ai-rejected')
    expect(reviewLabelFor('ready', false)).toBe('ai-ready')
    expect(reviewLabelFor('polish', true)).toBe('ai-ready')
    expect(reviewLabelFor('polish', false)).toBe('ai-needs-work')
  })
})
