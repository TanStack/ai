import { describe, expect, it } from 'vitest'
import { looksLikeReport } from './repo-report-schema'

describe('looksLikeReport', () => {
  it('accepts a complete report', () => {
    expect(
      looksLikeReport({
        name: 'TanStack AI',
        oneLiner: 'A type-safe AI SDK.',
        audience: 'TypeScript developers',
        mainPackages: [{ name: '@tanstack/ai', role: 'core' }],
        howToRun: 'pnpm install',
      }),
    ).toBe(true)
  })

  it('accepts a partial report while fields stream in', () => {
    expect(looksLikeReport({ name: 'TanStack AI' })).toBe(true)
  })

  it('rejects a string in mainPackages', () => {
    expect(looksLikeReport({ mainPackages: 'invalid' })).toBe(false)
  })

  it('rejects a non-string name', () => {
    expect(looksLikeReport({ name: {} })).toBe(false)
  })

  it('rejects an empty object', () => {
    expect(looksLikeReport({})).toBe(false)
  })
})
