/**
 * Unit tests for the JSON Patch diffing helpers used to emit STATE_DELTA
 * ops on the wire. Pins:
 *   - undefined values are normalized to null so `JSON.stringify` doesn't
 *     drop them, keeping ops RFC-6902 valid for the client applier.
 *   - undefined nested in arrays and objects is normalized too.
 *   - null is preserved as-is and primitive equality short-circuits.
 */
import { describe, expect, it } from 'vitest'
import { diffState } from '../src/engine/state-diff'

describe('diffState — undefined normalization', () => {
  it('replaces undefined leaf values with null in `replace` ops', () => {
    const prev: { value: string | undefined } = { value: 'before' }
    const next: { value: string | undefined } = { value: undefined }
    const ops = diffState(prev, next)
    expect(ops).toEqual([{ op: 'replace', path: '/value', value: null }])
  })

  it('replaces undefined leaf values with null in `add` ops', () => {
    const prev: Record<string, unknown> = {}
    const next: Record<string, unknown> = { value: undefined }
    const ops = diffState(prev, next)
    expect(ops).toEqual([{ op: 'add', path: '/value', value: null }])
  })

  it('normalizes undefined nested inside an object value', () => {
    const prev: { wrapper?: { inner: string | undefined } } = {}
    const next: { wrapper?: { inner: string | undefined } } = {
      wrapper: { inner: undefined },
    }
    const ops = diffState(prev, next)
    expect(ops).toEqual([
      { op: 'add', path: '/wrapper', value: { inner: null } },
    ])
  })

  it('normalizes undefined nested inside an array value', () => {
    const prev: { items: Array<string | undefined> } = { items: [] }
    const next: { items: Array<string | undefined> } = {
      items: ['a', undefined, 'b'],
    }
    const ops = diffState(prev, next)
    expect(ops).toEqual([
      { op: 'replace', path: '/items', value: ['a', null, 'b'] },
    ])
  })

  it('preserves explicit null (no normalization needed)', () => {
    const prev: { value: string | null } = { value: 'before' }
    const next: { value: string | null } = { value: null }
    const ops = diffState(prev, next)
    expect(ops).toEqual([{ op: 'replace', path: '/value', value: null }])
  })

  it('JSON-roundtrips emitted ops without dropping the `value` field', () => {
    // Regression contract: if normalization missed a spot, `JSON.parse(
    // JSON.stringify(op))` would have no `value` property, and the
    // client's applier would silently write `undefined`.
    const prev: { value?: string | undefined } = {}
    const next: { value?: string | undefined } = { value: undefined }
    const ops = diffState(prev, next)
    const roundtripped = JSON.parse(JSON.stringify(ops))
    expect(roundtripped[0]).toHaveProperty('value')
    expect(roundtripped[0].value).toBeNull()
  })
})
