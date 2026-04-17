/**
 * Type-level tests for clientOutput on tool definitions.
 *
 * These tests verify that TypeScript correctly infers the clientOutput
 * parameter type from the outputSchema, and that the property propagates
 * through .server() and .client() builders.
 */

import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '../src/activities/chat/tools/tool-definition'

describe('clientOutput type inference', () => {
  const outputSchema = z.object({
    id: z.string(),
    name: z.string(),
    ssn: z.string(),
    internalScore: z.number(),
  })

  type ExpectedOutput = z.infer<typeof outputSchema>

  it('should type the clientOutput parameter from outputSchema', () => {
    toolDefinition({
      name: 'lookup_user',
      description: 'Look up a user',
      outputSchema,
      clientOutput: (result) => {
        // result should be typed as the inferred output schema type
        expectTypeOf(result).toEqualTypeOf<ExpectedOutput>()
        return { id: result.id }
      },
    })
  })

  it('should allow clientOutput to return any shape', () => {
    // clientOutput return type is unknown — no constraints on what shape the
    // filtered result has. This is intentional: the client result doesn't need
    // to conform to the outputSchema.
    toolDefinition({
      name: 'flexible_return',
      description: 'Return anything',
      outputSchema,
      clientOutput: (result) => {
        expectTypeOf(result).toEqualTypeOf<ExpectedOutput>()
        return { justId: result.id, extra: 42 }
      },
    })
  })

  it('should reject accessing nonexistent properties in clientOutput', () => {
    toolDefinition({
      name: 'bad_access',
      description: 'Bad property access',
      outputSchema,
      clientOutput: (result) => ({
        id: result.id,
        // @ts-expect-error - nonExistent does not exist on output schema
        bad: result.nonExistent,
      }),
    })
  })

  it('should propagate clientOutput through .server()', () => {
    const tool = toolDefinition({
      name: 'server_propagation',
      description: 'Check server propagation',
      outputSchema,
      clientOutput: (result) => ({ id: result.id }),
    })

    const serverTool = tool.server(async () => ({
      id: '1',
      name: 'Alice',
      ssn: '000',
      internalScore: 99,
    }))

    // ServerTool extends Tool which uses (result: any) => any for clientOutput.
    // Verify it exists and is callable.
    expectTypeOf(serverTool).toHaveProperty('clientOutput')
    if (serverTool.clientOutput) {
      expectTypeOf(serverTool.clientOutput).toBeFunction()
    }
  })

  it('should propagate clientOutput through .client()', () => {
    const tool = toolDefinition({
      name: 'client_propagation',
      description: 'Check client propagation',
      outputSchema,
      clientOutput: (result) => ({ id: result.id }),
    })

    const clientTool = tool.client()

    // ClientTool preserves the strongly-typed clientOutput
    expectTypeOf(clientTool).toHaveProperty('clientOutput')
    if (clientTool.clientOutput) {
      // The parameter is typed from outputSchema
      type Param = Parameters<typeof clientTool.clientOutput>[0]
      expectTypeOf<Param>().toEqualTypeOf<ExpectedOutput>()
    }
  })

  it('should type clientOutput parameter as any when no outputSchema', () => {
    // Without outputSchema, SchemaInput defaults to StandardJSONSchemaV1<any, any> | JSONSchema,
    // so InferSchemaType resolves to `any` — matching the convention of execute's args type.
    toolDefinition({
      name: 'no_schema',
      description: 'No output schema',
      clientOutput: (result) => {
        expectTypeOf(result).toBeAny()
        return result
      },
    })
  })

  it('should allow omitting clientOutput entirely', () => {
    const tool = toolDefinition({
      name: 'no_filter',
      description: 'No client filtering',
      outputSchema,
    })

    // clientOutput should be optional (undefined at runtime)
    expectTypeOf(tool).toHaveProperty('clientOutput')
    expectTypeOf(tool.clientOutput).toBeNullable()
  })
})
