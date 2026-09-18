import { describe, expect, it } from 'vitest'
import { parseResultsFile } from './results'

const READY = { verdict: 'ready', issues: [] }

function file(results: Array<unknown>) {
  return { results }
}

describe('parseResultsFile', () => {
  it('reads a reviewed pull', () => {
    expect(
      parseResultsFile(file([{ number: 42, verdict: READY, patch: '' }])),
    ).toEqual({
      results: [
        { number: 42, verdict: { verdict: 'ready', issues: [] }, patch: '' },
      ],
    })
  })

  it('reads an empty run', () => {
    expect(parseResultsFile(file([]))).toEqual({ results: [] })
  })

  // The review job runs an agent over untrusted code, so a malformed or
  // hostile payload must not reach the job holding the PAT.
  it('rejects a payload that is not a results file', () => {
    expect(() => parseResultsFile(null)).toThrow('no results array')
    expect(() => parseResultsFile({})).toThrow('no results array')
    expect(() => parseResultsFile({ results: 'all good' })).toThrow(
      'no results array',
    )
  })

  it('rejects an entry without a usable PR number', () => {
    expect(() =>
      parseResultsFile(file([{ verdict: READY, patch: '' }])),
    ).toThrow('no valid number')
    expect(() =>
      parseResultsFile(file([{ number: 0, verdict: READY, patch: '' }])),
    ).toThrow('no valid number')
    expect(() =>
      parseResultsFile(file([{ number: -1, verdict: READY, patch: '' }])),
    ).toThrow('no valid number')
    expect(() =>
      parseResultsFile(file([{ number: 1.5, verdict: READY, patch: '' }])),
    ).toThrow('no valid number')
  })

  it('rejects an entry whose patch is not a string', () => {
    expect(() =>
      parseResultsFile(file([{ number: 42, verdict: READY }])),
    ).toThrow('no patch string')
    expect(() =>
      parseResultsFile(file([{ number: 42, verdict: READY, patch: 7 }])),
    ).toThrow('no patch string')
  })

  it('rejects an unusable verdict', () => {
    expect(() =>
      parseResultsFile(file([{ number: 42, verdict: 'ready', patch: '' }])),
    ).toThrow()
    expect(() =>
      parseResultsFile(
        file([{ number: 42, verdict: { verdict: 'merge it' }, patch: '' }]),
      ),
    ).toThrow()
  })

  // Two entries for one PR could otherwise race two pushes at one branch.
  it('rejects a repeated pull request', () => {
    expect(() =>
      parseResultsFile(
        file([
          { number: 42, verdict: READY, patch: '' },
          { number: 42, verdict: READY, patch: 'diff' },
        ]),
      ),
    ).toThrow('repeats #42')
  })
})
