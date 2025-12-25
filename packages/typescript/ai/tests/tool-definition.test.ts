import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '../src/activities/chat/tools/tool-definition'
import type { ToolOptions } from '../src'

describe('toolDefinition', () => {
  it('should create a tool definition with basic properties', () => {
    const tool = toolDefinition({
      name: 'getWeather',
      description: 'Get the weather for a location',
    })

    expect(tool.name).toBe('getWeather')
    expect(tool.description).toBe('Get the weather for a location')
    expect(tool.__toolSide).toBe('definition')
  })

  it('should create a tool definition with input and output schemas', () => {
    const tool = toolDefinition({
      name: 'addToCart',
      description: 'Add item to cart',
      inputSchema: z.object({
        itemId: z.string(),
        quantity: z.number(),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        cartId: z.string(),
      }),
    })

    expect(tool.name).toBe('addToCart')
    expect(tool.inputSchema).toBeDefined()
    expect(tool.outputSchema).toBeDefined()
  })

  it('should create a server tool with execute function', async () => {
    const tool = toolDefinition({
      name: 'getWeather',
      description: 'Get weather',
      inputSchema: z.object({
        location: z.string(),
      }),
      outputSchema: z.object({
        temperature: z.number(),
        conditions: z.string(),
      }),
    })

    const executeFn = vi.fn((_args: { location: string }, _options?: unknown) => {
      return {
        temperature: 72,
        conditions: 'sunny',
      }
    })

    const serverTool = tool.server(executeFn)

    expect(serverTool.__toolSide).toBe('server')
    expect(serverTool.name).toBe('getWeather')
    expect(serverTool.execute).toBeDefined()

    if (serverTool.execute) {
      const result = await serverTool.execute({ location: 'Paris' }, { context: undefined })
      expect(result).toEqual({ temperature: 72, conditions: 'sunny' })
      expect(executeFn).toHaveBeenCalledWith({ location: 'Paris' }, { context: undefined })
    }
  })

  it('should create a client tool with execute function', async () => {
    const tool = toolDefinition({
      name: 'saveToLocalStorage',
      description: 'Save data to localStorage',
      inputSchema: z.object({
        key: z.string(),
        value: z.string(),
      }),
      outputSchema: z.object({
        success: z.boolean(),
      }),
    })

    const executeFn = vi.fn(async (_args: { key: string; value: string }, _options?: unknown) => {
      return { success: true }
    })

    const clientTool = tool.client(executeFn)

    expect(clientTool.__toolSide).toBe('client')
    expect(clientTool.name).toBe('saveToLocalStorage')
    expect(clientTool.execute).toBeDefined()

    if (clientTool.execute) {
      const result = await clientTool.execute({ key: 'test', value: 'data' }, { context: undefined })
      expect(result).toEqual({ success: true })
      expect(executeFn).toHaveBeenCalledWith({ key: 'test', value: 'data' }, { context: undefined })
    }
  })

  it('should create a client tool without execute function', () => {
    const tool = toolDefinition({
      name: 'getUserInfo',
      description: 'Get user information',
      inputSchema: z.object({
        userId: z.string(),
      }),
    })

    const clientTool = tool.client()

    expect(clientTool.__toolSide).toBe('client')
    expect(clientTool.name).toBe('getUserInfo')
    expect(clientTool.execute).toBeUndefined()
  })

  it('should preserve needsApproval flag', () => {
    const tool = toolDefinition({
      name: 'deleteFile',
      description: 'Delete a file',
      needsApproval: true,
      inputSchema: z.object({
        path: z.string(),
      }),
    })

    expect(tool.needsApproval).toBe(true)

    const serverTool = tool.server(async (_args) => ({ success: true }))
    expect(serverTool.needsApproval).toBe(true)

    const clientTool = tool.client()
    expect(clientTool.needsApproval).toBe(true)
  })

  it('should preserve metadata', () => {
    const tool = toolDefinition({
      name: 'customTool',
      description: 'A custom tool',
      metadata: {
        category: 'utility',
        version: '1.0.0',
      },
    })

    expect(tool.metadata).toEqual({
      category: 'utility',
      version: '1.0.0',
    })

    const serverTool = tool.server(async () => ({}))
    expect(serverTool.metadata).toEqual({
      category: 'utility',
      version: '1.0.0',
    })

    const clientTool = tool.client()
    expect(clientTool.metadata).toEqual({
      category: 'utility',
      version: '1.0.0',
    })
  })

  it('should handle synchronous execute functions', () => {
    const tool = toolDefinition({
      name: 'syncTool',
      description: 'A synchronous tool',
      inputSchema: z.object({
        value: z.number(),
      }),
      outputSchema: z.object({
        doubled: z.number(),
      }),
    })

    const serverTool = tool.server((args: { value: number }) => {
      return { doubled: args.value * 2 }
    })

    if (serverTool.execute) {
      const result = serverTool.execute({ value: 5 }, { context: undefined })
      expect(result).toEqual({ doubled: 10 })
    }
  })

  it('should handle complex nested schemas', () => {
    const tool = toolDefinition({
      name: 'processOrder',
      description: 'Process an order',
      inputSchema: z.object({
        orderId: z.string(),
        items: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number(),
          }),
        ),
        shipping: z.object({
          address: z.string(),
          method: z.enum(['standard', 'express']),
        }),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        orderNumber: z.string(),
        estimatedDelivery: z.string(),
      }),
    })

    expect(tool.name).toBe('processOrder')
    expect(tool.inputSchema).toBeDefined()
    expect(tool.outputSchema).toBeDefined()

    const serverTool = tool.server(async (args) => {
      return {
        success: true,
        orderNumber: `ORD-${args.orderId}`,
        estimatedDelivery: '2024-01-01',
      }
    })

    // Verify it can be called
    void serverTool.execute?.({
      orderId: '123',
      items: [],
      shipping: { address: '123 Main St', method: 'standard' },
    }, { context: undefined })

    expect(serverTool.__toolSide).toBe('server')
  })

  it('should work without schemas', () => {
    const tool = toolDefinition({
      name: 'simpleTool',
      description: 'A simple tool without schemas',
    })

    expect(tool.name).toBe('simpleTool')
    expect(tool.description).toBe('A simple tool without schemas')

    const serverTool = tool.server(async () => ({ result: 'ok' }))
    expect(serverTool.name).toBe('simpleTool')
  })

  it('should allow using definition directly as a tool', () => {
    const tool = toolDefinition({
      name: 'directTool',
      description: 'Can be used directly',
      inputSchema: z.object({
        input: z.string(),
      }),
    })

    // The definition itself should be usable as a tool
    expect(tool.name).toBe('directTool')
    expect(tool.description).toBe('Can be used directly')
    expect(tool.__toolSide).toBe('definition')
    expect(tool.inputSchema).toBeDefined()
  })

  it('should pass context to server tool execute function', async () => {
    const tool = toolDefinition({
      name: 'getContextValue',
      description: 'Get a value from context',
      inputSchema: z.object({
        key: z.string(),
      }),
      outputSchema: z.object({
        exists: z.boolean(),
        value: z.string().optional(),
      }),
    })

    const contextValue = 'test-value'
    const context = { testData: contextValue }

    const serverTool = tool.server(
      (_: unknown, options: ToolOptions<typeof context> | undefined) => {
        const exists = options?.context?.testData !== undefined
        const value = exists ? options.context?.testData : undefined
        return { exists, value }
      }
    )

    if (serverTool.execute) {
      const result = await serverTool.execute(
        { key: 'testData' },
        { context }
      )
      
      expect(result.exists).toBe(true)
      expect(result.value).toBe(contextValue)
    }
  })

  it('should pass context to client tool execute function', async () => {
    const tool = toolDefinition({
      name: 'getContextValue',
      description: 'Get a value from context',
      inputSchema: z.object({
        key: z.string(),
      }),
      outputSchema: z.object({
        exists: z.boolean(),
        value: z.string().optional(),
      }),
    })

    const contextValue = 'test-value'
    const context = { testData: contextValue }

    const clientTool = tool.client(
      (_: unknown, options: ToolOptions<typeof context> | undefined) => {
        const exists = options?.context?.testData !== undefined
        const value = exists ? options.context?.testData : undefined
        return { exists, value }
      }
    )

    if (clientTool.execute) {
      const result = await clientTool.execute(
        { key: 'testData' },
        { context }
      )
      
      expect(result.exists).toBe(true)
      expect(result.value).toBe(contextValue)
    }
  })

  it('should handle missing context gracefully', async () => {
    const tool = toolDefinition({
      name: 'getContextValue',
      description: 'Get a value from context',
      inputSchema: z.object({
        key: z.string(),
      }),
      outputSchema: z.object({
        exists: z.boolean(),
        value: z.string().optional(),
      }),
    })

    const serverTool = tool.server(
      (_: unknown, options: ToolOptions<{ testData?: string }> | undefined) => {
        const exists = options?.context?.testData !== undefined
        const value = exists ? options.context?.testData : undefined
        return { exists, value }
      }
    )

    if (serverTool.execute) {
      const result = await serverTool.execute(
        { key: 'testData' },
        { context: {} } // Empty context
      )
      
      expect(result.exists).toBe(false)
      expect(result.value).toBeUndefined()
    }
  })
})
