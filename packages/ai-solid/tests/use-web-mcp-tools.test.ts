import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { renderHook } from '@solidjs/testing-library'
import { toolDefinition } from '@tanstack/ai/client'
import { useWebMCPTools } from '../src/index'
import type { UseWebMCPToolsOptions } from '../src/index'

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

describe('useWebMCPTools (Solid)', () => {
  it('registers tools and removes them when the owner is cleaned up', async () => {
    const modelContext = installModelContext()
    const { cleanup } = renderHook(() => useWebMCPTools([statusTool]))

    await vi.waitFor(() => expect(modelContext.tools.has('status')).toBe(true))
    cleanup()

    expect(modelContext.tools.size).toBe(0)
  })

  it('reports asynchronous registration errors', async () => {
    installModelContext({ failOn: 'status' })
    const onError = vi.fn()
    const { cleanup } = renderHook(() =>
      useWebMCPTools([statusTool], { onError }),
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
      useWebMCPTools([statusTool], { onError }),
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
    const options: UseWebMCPToolsOptions<typeof tools> = {
      context: { tenantId: 'tenant-1' },
      toolOptions: { contextual: { title: 'Tenant status' } },
    }

    expectTypeOf(options.context).toEqualTypeOf<{ tenantId: string }>()

    const checkTypes = () => {
      // @ts-expect-error contextual tools require context
      useWebMCPTools(tools)
      useWebMCPTools(tools, options)
      useWebMCPTools(tools, {
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
