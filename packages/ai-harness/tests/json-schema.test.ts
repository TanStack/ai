import { describe, expect, it } from 'vitest'
import { jsonSchemaIssues, standardJsonSchema } from '../src/json-schema'

describe('jsonSchemaIssues', () => {
  const schema = {
    type: 'object',
    properties: {
      answer: { type: 'string', enum: ['once', 'always', 'reject'] },
      count: { type: 'integer', minimum: 1 },
      tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    },
    required: ['answer'],
    additionalProperties: false,
  }

  it('accepts a value that fits', () => {
    expect(
      jsonSchemaIssues(schema, { answer: 'once', count: 2, tags: ['a'] }),
    ).toEqual([])
  })

  it('names each problem, with the path of the field', () => {
    expect(
      jsonSchemaIssues(schema, {
        count: 1.5,
        tags: ['a', 'a', 3],
        extra: true,
      }),
    ).toEqual([
      'The answer needs the field answer.',
      'The answer at count must be integer.',
      'The answer at tags has an item twice.',
      'The answer at tags[2] must be string.',
      'The answer has the unknown field extra.',
    ])
    expect(jsonSchemaIssues(schema, 'once')).toEqual([
      'The answer must be object.',
    ])
  })

  it('checks anyOf and oneOf, and ignores keywords it does not know', () => {
    const either = { anyOf: [{ type: 'string' }, { type: 'number' }] }
    expect(jsonSchemaIssues(either, 3)).toEqual([])
    expect(jsonSchemaIssues(either, true)).toEqual([
      'The answer does not fit the schema.',
    ])
    expect(jsonSchemaIssues({ format: 'email' }, 'not an email')).toEqual([])
    expect(jsonSchemaIssues(undefined, { any: 'thing' })).toEqual([])
  })
})

describe('standardJsonSchema', () => {
  it('checks values with the JSON Schema, and exports it', () => {
    const json = { type: 'string' }
    const standard = standardJsonSchema<string>(json)['~standard']
    expect(standard.validate('a')).toEqual({ value: 'a' })
    expect(standard.validate(1)).toEqual({
      issues: [{ message: 'The answer must be string.' }],
    })
    expect(standard.jsonSchema.input({})).toBe(json)
  })
})
