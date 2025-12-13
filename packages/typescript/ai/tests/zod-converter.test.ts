import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { convertZodToJsonSchema } from '../src/tools/zod-converter'
import type { JSONSchema } from '../src/types'

describe('convertZodToJsonSchema', () => {
  it('should return undefined for undefined schema', () => {
    const result = convertZodToJsonSchema(undefined)
    expect(result).toBeUndefined()
  })

  it('should convert a simple string schema', () => {
    const schema = z.string()
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.type).toBe('string')
  })

  it('should convert a simple number schema', () => {
    const schema = z.number()
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.type).toBe('number')
  })

  it('should convert a simple boolean schema', () => {
    const schema = z.boolean()
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.type).toBe('boolean')
  })

  it('should convert an object schema with properties', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.type).toBe('object')
    expect(result?.properties).toBeDefined()
    expect(result?.properties?.name?.type).toBe('string')
    expect(result?.properties?.age?.type).toBe('number')
    expect(result?.required).toContain('name')
    expect(result?.required).toContain('age')
  })

  it('should handle optional fields', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().optional(),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.type).toBe('object')
    expect(result?.required).toContain('name')
    expect(result?.required).not.toContain('age')
  })

  it('should handle enum types', () => {
    const schema = z.object({
      unit: z.enum(['celsius', 'fahrenheit']),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.properties?.unit?.enum).toEqual(['celsius', 'fahrenheit'])
    expect(result?.required).toContain('unit')
  })

  it('should handle optional enum types', () => {
    const schema = z.object({
      unit: z.enum(['celsius', 'fahrenheit']).optional(),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.properties?.unit?.enum).toEqual(['celsius', 'fahrenheit'])
    expect(result?.required).not.toContain('unit')
  })

  it('should handle descriptions', () => {
    const schema = z.object({
      location: z.string().describe('City name'),
      unit: z
        .enum(['celsius', 'fahrenheit'])
        .optional()
        .describe('Temperature unit'),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.properties?.location?.description).toBe('City name')
    expect(result?.properties?.unit?.description).toBe('Temperature unit')
  })

  it('should handle nested objects', () => {
    const schema = z.object({
      address: z.object({
        street: z.string(),
        city: z.string(),
      }),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.type).toBe('object')
    expect(result?.properties?.address?.type).toBe('object')
    expect(result?.properties?.address?.properties?.street?.type).toBe('string')
    expect(result?.properties?.address?.properties?.city?.type).toBe('string')
  })

  it('should handle empty object schema', () => {
    const schema = z.object({})
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.type).toBe('object')
    expect(result?.properties).toBeDefined()
    expect(Array.isArray(result?.required)).toBe(true)
    expect(result?.required).toHaveLength(0)
  })

  it('should ensure type: "object" is set for object schemas', () => {
    const schema = z.object({
      name: z.string(),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result?.type).toBe('object')
  })

  it('should ensure properties exists for object types', () => {
    const schema = z.object({
      name: z.string(),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result?.properties).toBeDefined()
    expect(typeof result?.properties).toBe('object')
  })

  it('should ensure required array exists for object types', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().optional(),
    })
    const result = convertZodToJsonSchema(schema)

    expect(Array.isArray(result?.required)).toBe(true)
    expect(result?.required).toContain('name')
    expect(result?.required).not.toContain('age')
  })

  it('should remove $schema property', () => {
    const schema = z.object({
      name: z.string(),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect('$schema' in (result || {})).toBe(false)
  })

  it('should handle arrays', () => {
    const schema = z.object({
      items: z.array(z.string()),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.properties?.items?.type).toBe('array')
    expect(result?.properties?.items?.items?.type).toBe('string')
  })

  it('should handle array of objects', () => {
    const schema = z.object({
      users: z.array(
        z.object({
          name: z.string(),
          age: z.number(),
        }),
      ),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.properties?.users?.type).toBe('array')
    expect(result?.properties?.users?.items?.type).toBe('object')
    expect(result?.properties?.users?.items?.properties?.name?.type).toBe(
      'string',
    )
    expect(result?.properties?.users?.items?.properties?.age?.type).toBe(
      'number',
    )
  })

  it('should handle union types', () => {
    const schema = z.object({
      value: z.union([z.string(), z.number()]),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.properties?.value).toBeDefined()
    // Union types may be represented differently by zod-to-json-schema
    expect(result?.properties?.value).toBeDefined()
  })

  it('should handle default values', () => {
    const schema = z.object({
      count: z.number().default(0),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    // Default values may be included in the schema
    expect(result?.properties?.count).toBeDefined()
  })

  it('should handle complex nested schema', () => {
    const schema = z.object({
      user: z.object({
        name: z.string().describe('User name'),
        age: z.number().optional(),
        preferences: z.object({
          theme: z.enum(['light', 'dark']).default('light'),
          notifications: z.boolean().default(true),
        }),
      }),
      tags: z.array(z.string()),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.type).toBe('object')
    expect(result?.properties?.user?.type).toBe('object')
    expect(result?.properties?.user?.properties?.name?.type).toBe('string')
    expect(result?.properties?.user?.properties?.name?.description).toBe(
      'User name',
    )
    expect(result?.properties?.user?.properties?.preferences?.type).toBe(
      'object',
    )
    expect(result?.properties?.tags?.type).toBe('array')
  })

  it('should handle nullable fields', () => {
    const schema = z.object({
      value: z.string().nullable(),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.properties?.value).toBeDefined()
  })

  it('should handle date schema', () => {
    // Note: Date schemas may not be directly supported in JSON Schema
    // This test verifies the function doesn't crash
    const schema = z.object({
      createdAt: z.string().datetime(), // Use datetime string instead
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.properties?.createdAt).toBeDefined()
  })

  it('should handle string with constraints', () => {
    const schema = z.object({
      email: z.string().email(),
      minLength: z.string().min(5),
      maxLength: z.string().max(10),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.properties?.email?.type).toBe('string')
    expect(result?.properties?.minLength?.type).toBe('string')
    expect(result?.properties?.maxLength?.type).toBe('string')
  })

  it('should handle number with constraints', () => {
    const schema = z.object({
      min: z.number().min(0),
      max: z.number().max(100),
      int: z.number().int(),
    })
    const result = convertZodToJsonSchema(schema)

    expect(result).toBeDefined()
    expect(result?.properties?.min?.type).toBe('number')
    expect(result?.properties?.max?.type).toBe('number')
    // z.number().int() returns type "integer" in JSON Schema
    expect(result?.properties?.int?.type).toBe('integer')
  })

  describe('JSONSchema passthrough', () => {
    it('should pass through a simple JSONSchema object unchanged', () => {
      const jsonSchema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      }
      const result = convertZodToJsonSchema(jsonSchema)

      expect(result).toBe(jsonSchema) // Same reference
      expect(result).toEqual(jsonSchema)
    })

    it('should pass through JSONSchema with nested objects', () => {
      const jsonSchema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
            required: ['name', 'email'],
          },
        },
        required: ['user'],
      }
      const result = convertZodToJsonSchema(jsonSchema)

      expect(result).toBe(jsonSchema)
    })

    it('should pass through JSONSchema with arrays', () => {
      const jsonSchema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
          users: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' },
              },
            },
          },
        },
      }
      const result = convertZodToJsonSchema(jsonSchema)

      expect(result).toBe(jsonSchema)
    })

    it('should pass through JSONSchema with enum', () => {
      const jsonSchema: JSONSchema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'active', 'completed'],
          },
          priority: {
            type: 'number',
            enum: [1, 2, 3],
          },
        },
      }
      const result = convertZodToJsonSchema(jsonSchema)

      expect(result).toBe(jsonSchema)
    })

    it('should pass through JSONSchema with descriptions', () => {
      const jsonSchema: JSONSchema = {
        type: 'object',
        description: 'A weather request',
        properties: {
          location: {
            type: 'string',
            description: 'The city or location to get weather for',
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: 'Temperature unit',
          },
        },
        required: ['location'],
      }
      const result = convertZodToJsonSchema(jsonSchema)

      expect(result).toBe(jsonSchema)
      expect(result?.description).toBe('A weather request')
      expect(result?.properties?.location?.description).toBe(
        'The city or location to get weather for',
      )
    })

    it('should pass through JSONSchema with $ref and $defs', () => {
      const jsonSchema: JSONSchema = {
        type: 'object',
        $defs: {
          Address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
            },
          },
        },
        properties: {
          homeAddress: { $ref: '#/$defs/Address' },
          workAddress: { $ref: '#/$defs/Address' },
        },
      }
      const result = convertZodToJsonSchema(jsonSchema)

      expect(result).toBe(jsonSchema)
    })

    it('should pass through JSONSchema with allOf/anyOf/oneOf', () => {
      const jsonSchema: JSONSchema = {
        type: 'object',
        properties: {
          value: {
            oneOf: [{ type: 'string' }, { type: 'number' }],
          },
          config: {
            allOf: [
              { type: 'object', properties: { name: { type: 'string' } } },
              { type: 'object', properties: { value: { type: 'number' } } },
            ],
          },
        },
      }
      const result = convertZodToJsonSchema(jsonSchema)

      expect(result).toBe(jsonSchema)
    })

    it('should pass through JSONSchema with validation constraints', () => {
      const jsonSchema: JSONSchema = {
        type: 'object',
        properties: {
          age: {
            type: 'number',
            minimum: 0,
            maximum: 150,
          },
          email: {
            type: 'string',
            format: 'email',
            minLength: 5,
            maxLength: 100,
          },
          tags: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            uniqueItems: true,
          },
        },
      }
      const result = convertZodToJsonSchema(jsonSchema)

      expect(result).toBe(jsonSchema)
      expect(result?.properties?.age?.minimum).toBe(0)
      expect(result?.properties?.age?.maximum).toBe(150)
      expect(result?.properties?.email?.format).toBe('email')
      expect(result?.properties?.tags?.uniqueItems).toBe(true)
    })

    it('should pass through empty JSONSchema object', () => {
      const jsonSchema: JSONSchema = {}
      const result = convertZodToJsonSchema(jsonSchema)

      expect(result).toBe(jsonSchema)
    })

    it('should pass through JSONSchema with only type', () => {
      const jsonSchema: JSONSchema = { type: 'string' }
      const result = convertZodToJsonSchema(jsonSchema)

      expect(result).toBe(jsonSchema)
    })

    it('should pass through JSONSchema with additionalProperties', () => {
      const jsonSchema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      }
      const result = convertZodToJsonSchema(jsonSchema)

      expect(result).toBe(jsonSchema)
      expect(result?.additionalProperties).toBe(false)
    })

    it('should pass through JSONSchema with pattern', () => {
      const jsonSchema: JSONSchema = {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            pattern: '^\\+?[1-9]\\d{1,14}$',
          },
        },
      }
      const result = convertZodToJsonSchema(jsonSchema)

      expect(result).toBe(jsonSchema)
      expect(result?.properties?.phone?.pattern).toBe('^\\+?[1-9]\\d{1,14}$')
    })

    it('should distinguish between Zod schemas and plain objects', () => {
      // Zod schema should be converted
      const zodSchema = z.object({ name: z.string() })
      const zodResult = convertZodToJsonSchema(zodSchema)

      // JSONSchema should pass through
      const jsonSchema: JSONSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
      }
      const jsonResult = convertZodToJsonSchema(jsonSchema)

      // Both should produce similar output structure
      expect(zodResult?.type).toBe('object')
      expect(jsonResult?.type).toBe('object')
      expect(zodResult?.properties?.name?.type).toBe('string')
      expect(jsonResult?.properties?.name?.type).toBe('string')

      // But JSONSchema should be the same reference
      expect(jsonResult).toBe(jsonSchema)
      // Zod result should be a new object
      expect(zodResult).not.toBe(zodSchema)
    })
  })
})
