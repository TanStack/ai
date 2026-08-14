import { describe, expect, it } from 'vitest'
import {
  appendOutputSchemaInstruction,
  parseJsonFromAssistantText,
} from '../src/utilities/structured-output-text'

describe('parseJsonFromAssistantText', () => {
  it('parses a bare object', () => {
    expect(parseJsonFromAssistantText('{"a":1}')).toEqual({ a: 1 })
  })

  it('strips a json fence', () => {
    expect(parseJsonFromAssistantText('```json\n{"a":1}\n```')).toEqual({
      a: 1,
    })
  })

  it('strips a bare fence', () => {
    expect(parseJsonFromAssistantText('```\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('throws on prose', () => {
    expect(() => parseJsonFromAssistantText('not json')).toThrow()
  })

  it('appends the schema instruction', () => {
    const next = appendOutputSchemaInstruction('Look around.', {
      type: 'object',
    })
    expect(next).toContain('Look around.')
    expect(next).toContain('"type":"object"')
  })
})
