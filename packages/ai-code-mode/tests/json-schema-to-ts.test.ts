import { describe, expect, it } from 'vitest'
import {
  generateTypeStubs,
  jsonSchemaToTypeScript,
} from '../src/type-generator/json-schema-to-ts'

describe('jsonSchemaToTypeScript', () => {
  it('handles string type', () => {
    const result = jsonSchemaToTypeScript({ type: 'string' }, 'MyType')
    expect(result.name).toBe('string')
    expect(result.declaration).toBe('')
  })

  it('handles number type', () => {
    const result = jsonSchemaToTypeScript({ type: 'number' }, 'MyType')
    expect(result.name).toBe('number')
  })

  it('handles integer type as number', () => {
    const result = jsonSchemaToTypeScript({ type: 'integer' }, 'MyType')
    expect(result.name).toBe('number')
  })

  it('handles boolean type', () => {
    const result = jsonSchemaToTypeScript({ type: 'boolean' }, 'MyType')
    expect(result.name).toBe('boolean')
  })

  it('handles null type', () => {
    const result = jsonSchemaToTypeScript({ type: 'null' }, 'MyType')
    expect(result.name).toBe('null')
  })

  it('generates interface for objects with properties', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
    }
    const result = jsonSchemaToTypeScript(schema, 'Person')
    expect(result.name).toBe('Person')
    expect(result.declaration).toContain('interface Person')
    expect(result.declaration).toContain('name: string;')
    expect(result.declaration).toContain('age?: number;')
  })

  it('marks optional vs required properties', () => {
    const schema = {
      type: 'object',
      properties: {
        required: { type: 'string' },
        optional: { type: 'string' },
      },
      required: ['required'],
    }
    const result = jsonSchemaToTypeScript(schema, 'Test')
    expect(result.declaration).toContain('required: string;')
    expect(result.declaration).toContain('optional?: string;')
  })

  it('handles nested objects as inline types', () => {
    const schema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
          },
        },
      },
    }
    const result = jsonSchemaToTypeScript(schema, 'User')
    expect(result.declaration).toContain('address?:')
    expect(result.declaration).toContain('street')
  })

  it('handles arrays with items', () => {
    const schema = {
      type: 'array',
      items: { type: 'string' },
    }
    const result = jsonSchemaToTypeScript(schema, 'List')
    expect(result.name).toBe('Array<string>')
  })

  it('handles arrays without items', () => {
    const schema = { type: 'array' }
    const result = jsonSchemaToTypeScript(schema, 'List')
    expect(result.name).toBe('Array<unknown>')
  })

  it('handles enums as union types', () => {
    const schema = { enum: ['red', 'green', 'blue'] }
    const result = jsonSchemaToTypeScript(schema, 'Color')
    expect(result.name).toBe('"red" | "green" | "blue"')
  })

  it('handles anyOf as union', () => {
    const schema = {
      anyOf: [{ type: 'string' }, { type: 'number' }],
    }
    const result = jsonSchemaToTypeScript(schema, 'Union')
    expect(result.name).toBe('string | number')
  })

  it('handles oneOf as union', () => {
    const schema = {
      oneOf: [{ type: 'boolean' }, { type: 'null' }],
    }
    const result = jsonSchemaToTypeScript(schema, 'Union')
    expect(result.name).toBe('boolean | null')
  })

  it('handles type arrays as union', () => {
    const schema = { type: ['string', 'null'] }
    const result = jsonSchemaToTypeScript(schema, 'Nullable')
    expect(result.name).toBe('string | null')
  })

  it('returns unknown for empty/unknown schemas', () => {
    const result = jsonSchemaToTypeScript({}, 'Mystery')
    expect(result.name).toBe('unknown')
  })
})

describe('generateTypeStubs', () => {
  it('generates full declarations with function signatures and JSDoc', () => {
    const bindings = {
      external_fetch: {
        name: 'external_fetch',
        description: 'Fetch data from API',
        inputSchema: {
          type: 'object',
          properties: { url: { type: 'string' } },
          required: ['url'],
        },
        execute: async () => ({}),
      },
    }

    const stubs = generateTypeStubs(bindings)
    expect(stubs).toContain('interface External_fetchInput')
    expect(stubs).toContain('url: string')
    expect(stubs).toContain(
      'declare function external_fetch(input: External_fetchInput)',
    )
    expect(stubs).toContain('/** Fetch data from API */')
  })

  it('omits JSDoc when includeDescriptions is false', () => {
    const bindings = {
      external_fetch: {
        name: 'external_fetch',
        description: 'Fetch data from API',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({}),
      },
    }

    const stubs = generateTypeStubs(bindings, { includeDescriptions: false })
    expect(stubs).not.toContain('/**')
    expect(stubs).toContain('declare function external_fetch')
  })

  it('includes output type when outputSchema is present', () => {
    const bindings = {
      external_fetch: {
        name: 'external_fetch',
        description: 'Fetch data',
        inputSchema: {
          type: 'object',
          properties: { q: { type: 'string' } },
        },
        outputSchema: {
          type: 'object',
          properties: { data: { type: 'string' } },
        },
        execute: async () => ({}),
      },
    }

    const stubs = generateTypeStubs(bindings)
    expect(stubs).toContain('External_fetchOutput')
    expect(stubs).toContain('Promise<External_fetchOutput>')
  })
})
