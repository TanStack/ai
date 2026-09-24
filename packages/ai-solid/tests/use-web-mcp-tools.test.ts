import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { renderHook } from '@solidjs/testing-library'
import { toolDefinition } from '@tanstack/ai/client'
import { ChatClient } from '@tanstack/ai-client'
import {
  useChat,
  usePageWebMCPTools,
  useRegisterWebMCPTools,
  useWebMCPTools,
} from '../src/index'
import { createMockConnectionAdapter } from './test-utils'
import type { UseRegisterWebMCPToolsOptions } from '../src/index'

interface RegisteredWebMCPTool {
  name: string
}

interface ModelContextOptions {
  failOn?: string
  pendingRegistration?: boolean
}

function installModelContext({
  failOn,
  pendingRegistration,
}: ModelContextOptions = {}) {
  const tools = new Map<string, RegisteredWebMCPTool>()
  const pendingTools = new Set<string>()
  const modelContext = {
    tools,
    pendingTools,
    async registerTool(
      tool: RegisteredWebMCPTool,
      options: { signal: AbortSignal },
    ) {
      if (tool.name === failOn) {
        throw new Error(`${tool.name} registration failed`)
      }
      if (pendingRegistration) {
        pendingTools.add(tool.name)
        return new Promise<void>((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              pendingTools.delete(tool.name)
              reject(options.signal.reason)
            },
            { once: true },
          )
        })
      }

      tools.set(tool.name, tool)
      options.signal.addEventListener('abort', () => tools.delete(tool.name), {
        once: true,
      })
    },
  }

  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: modelContext,
  })
  return modelContext
}

const statusTool = toolDefinition({
  name: 'status',
  description: 'Get the current status',
}).client(async () => ({ ok: true }))

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext')
})

describe('useRegisterWebMCPTools (Solid)', () => {
  it('registers tools and removes them when the owner is cleaned up', async () => {
    const modelContext = installModelContext()
    const { cleanup } = renderHook(() => useRegisterWebMCPTools([statusTool]))

    await vi.waitFor(() => expect(modelContext.tools.has('status')).toBe(true))
    cleanup()

    expect(modelContext.tools.size).toBe(0)
  })

  it('reports asynchronous registration errors', async () => {
    installModelContext({ failOn: 'status' })
    const onError = vi.fn()
    const { cleanup } = renderHook(() =>
      useRegisterWebMCPTools([statusTool], { onError }),
    )

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(onError).toHaveBeenCalledWith(
      new Error('status registration failed'),
    )
    cleanup()
  })

  it('does not report a pending registration rejected by owner cleanup', async () => {
    const modelContext = installModelContext({ pendingRegistration: true })
    const onError = vi.fn()
    const { cleanup } = renderHook(() =>
      useRegisterWebMCPTools([statusTool], { onError }),
    )

    expect(modelContext.pendingTools.has('status')).toBe(true)
    cleanup()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(modelContext.pendingTools.size).toBe(0)
    expect(onError).not.toHaveBeenCalled()
  })

  it('preserves tool-name and runtime-context types', () => {
    const contextual = toolDefinition({
      name: 'contextual',
      description: 'Read the tenant context',
    }).client<{ tenantId: string }>((_input, context) => {
      return context.context.tenantId
    })
    const tools = [contextual] as const
    const options: UseRegisterWebMCPToolsOptions<typeof tools> = {
      context: { tenantId: 'tenant-1' },
      toolOptions: { contextual: { title: 'Tenant status' } },
    }

    expectTypeOf(options.context).toEqualTypeOf<{ tenantId: string }>()

    const checkTypes = () => {
      // @ts-expect-error contextual tools require context
      useRegisterWebMCPTools(tools)
      useRegisterWebMCPTools(tools, options)
      useRegisterWebMCPTools(tools, {
        context: { tenantId: 'tenant-1' },
        toolOptions: {
          // @ts-expect-error tool options only accept inferred tool names
          unknown_tool: {},
        },
      })
    }
    void checkTypes
  })
})

describe('useWebMCPTools (Solid)', () => {
  it('is a deprecated alias of useRegisterWebMCPTools', () => {
    expect(useWebMCPTools).toBe(useRegisterWebMCPTools)
  })
})

function installPageTools(names: Array<string>) {
  const target = new EventTarget()
  const modelContext = {
    names,
    getTools: async () =>
      modelContext.names.map((name) => ({
        name,
        description: `Run ${name}`,
        origin: 'https://example.com',
      })),
    executeTool: async () => '"done"',
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    change(nextNames: Array<string>) {
      modelContext.names = nextNames
      target.dispatchEvent(new Event('toolchange'))
    },
  }
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: modelContext,
  })
  return modelContext
}

describe('usePageWebMCPTools (Solid)', () => {
  it('returns filtered page tools, updates on toolchange, and syncs useChat', async () => {
    const modelContext = installPageTools(['first', 'blocked'])
    const updateOptions = vi.spyOn(ChatClient.prototype, 'updateOptions')
    const { result, cleanup } = renderHook(() => {
      const pageTools = usePageWebMCPTools({
        filter: (tool) => tool.name !== 'blocked',
      })
      const chat = useChat({
        connection: createMockConnectionAdapter(),
        get tools() {
          return pageTools()
        },
      })
      return { pageTools, chat }
    })

    expect(result.pageTools()).toEqual([])
    await vi.waitFor(() =>
      expect(result.pageTools().map((tool) => tool.name)).toEqual(['first']),
    )
    modelContext.change(['first', 'second'])
    await vi.waitFor(() => expect(result.pageTools()).toHaveLength(2))
    expect(updateOptions).toHaveBeenCalledWith({ tools: result.pageTools() })
    await expect(result.pageTools()[0]?.execute?.({})).resolves.toBe('done')

    cleanup()
    updateOptions.mockRestore()
  })
})
