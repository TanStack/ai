import { describe, expect, it } from 'vitest'
import {
  getByPointer,
  isBinding,
  parseA2uiOperations,
  pointerToStatePath,
  setByPointer,
} from '../src/a2ui/index'

describe('A2UI operation parsing — shape discipline (addendum §A2.2)', () => {
  it('ignores flat legacy operations with a diagnostic, not silence', () => {
    const { operations, diagnostics } = parseA2uiOperations([
      { type: 'create_surface', surfaceId: 'x', catalogId: 'basic' },
    ])
    expect(operations).toHaveLength(0)
    expect(diagnostics.some((d) => d.code === 'flat-op-ignored')).toBe(true)
  })

  it('drops operations from an unsupported A2UI version with a diagnostic', () => {
    const { operations, diagnostics } = parseA2uiOperations([
      { version: 'v1.0', createSurface: { surfaceId: 'f', catalogId: 'b' } },
    ])
    expect(operations).toHaveLength(0)
    expect(diagnostics.some((d) => d.code === 'version-unsupported')).toBe(true)
  })

  it('accepts nested v0.9 operations and dispatches on the operation key', () => {
    const { operations } = parseA2uiOperations([
      { version: 'v0.9', createSurface: { surfaceId: 's', catalogId: 'b' } },
      {
        version: 'v0.9',
        updateComponents: { surfaceId: 's', components: [] },
      },
    ])
    expect(operations).toHaveLength(2)
    expect('createSurface' in operations[0]!).toBe(true)
    expect('updateComponents' in operations[1]!).toBe(true)
  })

  it('defaults a missing version when the container carries it', () => {
    const { operations } = parseA2uiOperations([
      { createSurface: { surfaceId: 's', catalogId: 'b' } },
    ])
    expect(operations).toHaveLength(1)
    expect(operations[0]!.version).toBe('v0.9')
  })
})

describe('A2UI container extraction', () => {
  it('unwraps the a2ui_operations container', () => {
    const { operations } = parseA2uiOperations({
      a2ui_operations: [
        { version: 'v0.9', createSurface: { surfaceId: 's', catalogId: 'b' } },
      ],
    })
    expect(operations).toHaveLength(1)
  })

  it('parses a JSON-string tool result', () => {
    const { operations } = parseA2uiOperations(
      JSON.stringify({
        a2ui_operations: [
          { version: 'v0.9', deleteSurface: { surfaceId: 's' } },
        ],
      }),
    )
    expect(operations).toHaveLength(1)
    expect('deleteSurface' in operations[0]!).toBe(true)
  })

  it('reports a non-JSON container string as a diagnostic', () => {
    const { operations, diagnostics } = parseA2uiOperations('not json {')
    expect(operations).toHaveLength(0)
    expect(diagnostics.some((d) => d.code === 'container-not-json')).toBe(true)
  })

  it('treats a single bare operation as a one-item list', () => {
    const { operations } = parseA2uiOperations({
      version: 'v0.9',
      createSurface: { surfaceId: 's', catalogId: 'b' },
    })
    expect(operations).toHaveLength(1)
  })
})

describe('binding detection', () => {
  it('recognises a sole { path } object as a binding', () => {
    expect(isBinding({ path: '/origin' })).toBe(true)
  })
  it('rejects objects that merely contain path', () => {
    expect(isBinding({ path: '/a', extra: 1 })).toBe(false)
    expect(isBinding({ value: 1 })).toBe(false)
    expect(isBinding('x')).toBe(false)
  })
})

describe('JSON Pointer helpers (RFC 6901)', () => {
  it('gets nested values', () => {
    const model = { passenger: { name: 'Ada' }, legs: [{ to: 'SFO' }] }
    expect(getByPointer(model, '/passenger/name')).toBe('Ada')
    expect(getByPointer(model, '/legs/0/to')).toBe('SFO')
    expect(getByPointer(model, '/')).toBe(model)
    expect(getByPointer(model, '/missing')).toBeUndefined()
  })

  it('sets immutably, creating containers shaped by the segment', () => {
    const model = { a: 1 }
    const next = setByPointer(model, '/b/0/c', 'x') as any
    expect(next.b[0].c).toBe('x')
    expect(next.a).toBe(1)
    expect(model).toEqual({ a: 1 }) // original untouched
    expect(setByPointer(model, '/', { replaced: true })).toEqual({
      replaced: true,
    })
  })

  it('unescapes ~1 and ~0, and converts pointers to state paths', () => {
    expect(getByPointer({ 'a/b': 1 }, '/a~1b')).toBe(1)
    expect(pointerToStatePath('/passenger/name')).toBe('passenger.name')
  })
})
