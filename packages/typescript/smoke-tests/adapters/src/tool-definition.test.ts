import { describe, expect, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import type { ClientTool, ServerTool } from '@tanstack/ai'

describe('Tool Definition', () => {
  describe('Basic Definition Creation', () => {
    it('should create a tool definition with schema', () => {
      const definition = toolDefinition({
        name: 'testTool',
        description: 'A test tool',
        inputSchema: z.object({
          param: z.string(),
        }),
        outputSchema: z.object({
          result: z.string(),
        }),
      })

      expect(definition.name).toBe('testTool')
      expect(definition.description).toBe('A test tool')
      expect(definition.inputSchema).toBeDefined()
      expect(definition.outputSchema).toBeDefined()
      expect(definition.__toolSide).toBe('definition')
    })

    it('should support optional schemas', () => {
      const definition = toolDefinition({
        name: 'simpleTool',
        description: 'A simple tool',
      })

      expect(definition.name).toBe('simpleTool')
      expect(definition.inputSchema).toBeUndefined()
      expect(definition.outputSchema).toBeUndefined()
    })

    it('should support needsApproval flag', () => {
      const definition = toolDefinition({
        name: 'approvalTool',
        description: 'Needs approval',
        needsApproval: true,
      })

      expect(definition.needsApproval).toBe(true)
    })
  })

  describe('Server Tool Creation', () => {
    it('should create a server tool with execute function', async () => {
      const definition = toolDefinition({
        name: 'serverTool',
        description: 'Server tool',
        inputSchema: z.object({
          value: z.number(),
        }),
        outputSchema: z.object({
          doubled: z.number(),
        }),
      })

      const serverTool = definition.server(async (args) => {
        return { doubled: args.value * 2 }
      })

      expect(serverTool.__toolSide).toBe('server')
      expect(serverTool.name).toBe('serverTool')
      expect(serverTool.execute).toBeDefined()

      const result = await serverTool.execute!({ value: 5 })
      expect(result).toEqual({ doubled: 10 })
    })

    it('should preserve schema and metadata in server tool', () => {
      const definition = toolDefinition({
        name: 'metaTool',
        description: 'Tool with metadata',
        inputSchema: z.object({ x: z.string() }),
        needsApproval: true,
        metadata: { key: 'value' },
      })

      const serverTool = definition.server(async () => ({ result: 'ok' }))

      expect(serverTool.name).toBe('metaTool')
      expect(serverTool.description).toBe('Tool with metadata')
      expect(serverTool.needsApproval).toBe(true)
      expect(serverTool.metadata).toEqual({ key: 'value' })
      expect(serverTool.inputSchema).toBeDefined()
    })
  })

  describe('Client Tool Creation', () => {
    it('should create a client tool with execute function', async () => {
      const definition = toolDefinition({
        name: 'clientTool',
        description: 'Client tool',
        inputSchema: z.object({
          text: z.string(),
        }),
        outputSchema: z.object({
          upper: z.string(),
        }),
      })

      const clientTool = definition.client(async (args) => {
        return { upper: args.text.toUpperCase() }
      })

      expect(clientTool.__toolSide).toBe('client')
      expect(clientTool.name).toBe('clientTool')
      expect(clientTool.execute).toBeDefined()

      const result = await clientTool.execute!({ text: 'hello' })
      expect(result).toEqual({ upper: 'HELLO' })
    })

    it('should create a client tool without execute function', () => {
      const definition = toolDefinition({
        name: 'noExecuteTool',
        description: 'Tool without execute',
        inputSchema: z.object({ data: z.string() }),
      })

      const clientTool = definition.client()

      expect(clientTool.__toolSide).toBe('client')
      expect(clientTool.name).toBe('noExecuteTool')
      expect(clientTool.execute).toBeUndefined()
    })

    it('should preserve schema and metadata in client tool', () => {
      const definition = toolDefinition({
        name: 'clientMetaTool',
        description: 'Client tool with metadata',
        inputSchema: z.object({ y: z.number() }),
        needsApproval: true,
        metadata: { clientKey: 'clientValue' },
      })

      const clientTool = definition.client(async () => ({ result: 'done' }))

      expect(clientTool.name).toBe('clientMetaTool')
      expect(clientTool.description).toBe('Client tool with metadata')
      expect(clientTool.needsApproval).toBe(true)
      expect(clientTool.metadata).toEqual({ clientKey: 'clientValue' })
      expect(clientTool.inputSchema).toBeDefined()
    })
  })

  describe('Hybrid Tools (Server + Client)', () => {
    it('should create both server and client tools from same definition', async () => {
      const definition = toolDefinition({
        name: 'hybridTool',
        description: 'Hybrid tool',
        inputSchema: z.object({
          count: z.number(),
        }),
        outputSchema: z.object({
          incremented: z.number(),
        }),
      })

      const serverTool = definition.server(async (args) => {
        return { incremented: args.count + 1 }
      })

      const clientTool = definition.client(async (args) => {
        return { incremented: args.count + 100 }
      })

      expect(serverTool.__toolSide).toBe('server')
      expect(clientTool.__toolSide).toBe('client')
      expect(serverTool.name).toBe('hybridTool')
      expect(clientTool.name).toBe('hybridTool')

      const serverResult = await serverTool.execute!({ count: 5 })
      const clientResult = await clientTool.execute!({ count: 5 })

      expect(serverResult).toEqual({ incremented: 6 })
      expect(clientResult).toEqual({ incremented: 105 })
    })
  })

  describe('Type Safety', () => {
    it('should infer types from Zod schemas', async () => {
      const definition = toolDefinition({
        name: 'typedTool',
        description: 'Type-safe tool',
        inputSchema: z.object({
          name: z.string(),
          age: z.number(),
        }),
        outputSchema: z.object({
          message: z.string(),
          adult: z.boolean(),
        }),
      })

      const serverTool = definition.server(async (args) => {
        // TypeScript should infer: args = { name: string; age: number }
        return {
          message: `Hello ${args.name}`,
          adult: args.age >= 18,
        }
      })

      const result = await serverTool.execute!({ name: 'Alice', age: 25 })
      expect(result).toEqual({
        message: 'Hello Alice',
        adult: true,
      })
    })

    it('should work with complex nested schemas', async () => {
      const definition = toolDefinition({
        name: 'complexTool',
        description: 'Complex nested types',
        inputSchema: z.object({
          user: z.object({
            id: z.string(),
            profile: z.object({
              name: z.string(),
              tags: z.array(z.string()),
            }),
          }),
        }),
        outputSchema: z.object({
          processed: z.boolean(),
          tagCount: z.number(),
        }),
      })

      const serverTool = definition.server(async (args) => {
        return {
          processed: true,
          tagCount: args.user.profile.tags.length,
        }
      })

      const result = await serverTool.execute!({
        user: {
          id: '123',
          profile: {
            name: 'Bob',
            tags: ['a', 'b', 'c'],
          },
        },
      })

      expect(result).toEqual({
        processed: true,
        tagCount: 3,
      })
    })
  })

  describe('Type Exports', () => {
    it('should export ClientTool type', () => {
      const definition = toolDefinition({
        name: 'exportTest',
        description: 'Test exports',
        inputSchema: z.object({ x: z.string() }),
        outputSchema: z.object({ y: z.string() }),
      })

      const clientTool = definition.client(async (args) => ({ y: args.x }))

      // Type assertion to ensure type is exported
      const _typedTool: ClientTool = clientTool
      expect(_typedTool.__toolSide).toBe('client')
    })

    it('should export ServerTool type', () => {
      const definition = toolDefinition({
        name: 'exportTestServer',
        description: 'Test server exports',
        inputSchema: z.object({ x: z.string() }),
        outputSchema: z.object({ y: z.string() }),
      })

      const serverTool = definition.server(async (args) => ({ y: args.x }))

      // Type assertion to ensure type is exported
      const _typedTool: ServerTool = serverTool
      expect(_typedTool.__toolSide).toBe('server')
    })
  })
})
