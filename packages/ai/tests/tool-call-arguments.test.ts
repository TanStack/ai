import { describe, expect, it } from 'vitest'
import { reconcileToolCallArguments } from '../src/utilities/tool-call-arguments'

describe('lexical tool argument reconciliation', () => {
  it.each([
    '  1e999  ',
    '-0',
    '9007199254740993',
    '1.20e+3',
    '"\\u0061"',
    '{"a":1e999,"b":[-0,9007199254740993,"\\u0061"]}',
  ])('keeps unchanged raw JSON exactly: %s', (raw) => {
    expect(reconcileToolCallArguments(raw, JSON.parse(raw))).toBe(raw)
  })
  it('reuses unchanged nested values after removing an optional null', () => {
    const raw =
      '{"removed":null,"nested":{"number":1e999,"text":"\\u0061"},"array":[-0,9007199254740993]}'
    expect(
      reconcileToolCallArguments(raw, {
        nested: { number: Infinity, text: 'a' },
        array: [-0, 9007199254740992],
      }),
    ).toBe(
      '{"nested":{"number":1e999,"text":"\\u0061"},"array":[-0,9007199254740993]}',
    )
  })
  it('retains unchanged array positions while correcting another position', () => {
    expect(reconcileToolCallArguments('[1e999,2,-0]', [Infinity, 3, -0])).toBe(
      '[1e999,3,-0]',
    )
  })
  it('uses valid JSON spelling for corrected numbers', () => {
    expect(
      reconcileToolCallArguments('{}', {
        positive: Infinity,
        negative: -Infinity,
        zero: -0,
      }),
    ).toBe('{"positive":1e999,"negative":-1e999,"zero":-0}')
  })
  it('does not repair malformed raw JSON with a parsed projection', () => {
    expect(reconcileToolCallArguments('{"broken":', {})).toBe('{"broken":')
  })
  it('serializes END-only input when no raw arguments exist', () => {
    expect(reconcileToolCallArguments(undefined, null)).toBe('null')
    expect(reconcileToolCallArguments(undefined, [1, true])).toBe('[1,true]')
  })
  it('leaves raw arguments alone when input is undefined', () => {
    expect(reconcileToolCallArguments('1e999', undefined)).toBe('1e999')
  })
})

describe('raw JSON key spelling', () => {
  it('keeps an escaped key when removing an unrelated null', () => {
    expect(
      reconcileToolCallArguments('{"\\u0061":9007199254740993,"drop":null}', {
        a: 9007199254740992,
      }),
    ).toBe('{"\\u0061":9007199254740993}')
  })
  it('uses the last duplicate key value and its original spelling', () => {
    expect(
      reconcileToolCallArguments('{"a":1,"\\u0061":1e999,"drop":null}', {
        a: Infinity,
      }),
    ).toBe('{"\\u0061":1e999}')
  })
  it('serializes sparse custom array positions as null slots', () => {
    const values: Array<unknown> = new Array(2)
    values[1] = -0
    expect(reconcileToolCallArguments(undefined, values)).toBe('[null,-0]')
  })
})

describe('ordinary custom input JSON semantics', () => {
  it('uses Date and boxed primitive JSON values', () => {
    expect(
      reconcileToolCallArguments('{}', new Date('2026-10-04T00:00:00Z')),
    ).toBe('"2026-10-04T00:00:00.000Z"')
    expect(reconcileToolCallArguments(undefined, Object(7))).toBe('7')
  })
  it('passes the property key to custom toJSON', () => {
    const input = {
      value: {
        toJSON(key: string) {
          return key
        },
      },
    }
    expect(reconcileToolCallArguments(undefined, input)).toBe(
      '{"value":"value"}',
    )
  })
})
