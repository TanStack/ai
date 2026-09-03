import { toolDefinition } from '@tanstack/ai/client'
import type { Handle } from 'remix/ui'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createWebMCPTools } from '../src/index'
import type { CreateWebMCPToolsOptions } from '../src/index'

interface RegisteredWebMCPTool {
  name: string
}

function installModelContext({
  failOn,
  keepRegistrationPending = false,
}: {
  failOn?: string
  keepRegistrationPending?: boolean
} = {}) {
  const tools = new Map<string, RegisteredWebMCPTool>()
  const modelContext = {
    tools,
    registerTool: vi.fn(
      async (tool: RegisteredWebMCPTool, options: { signal: AbortSignal }) => {
        if (tool.name === failOn) {
          throw new Error(`${tool.name} registration failed`)
        }
        if (keepRegistrationPending) {
          await new Promise<void>((_resolve, reject) => {
            options.signal.addEventListener(
              'abort',
              () => reject(options.signal.reason),
              { once: true },
            )
          })
        }

        tools.set(tool.name, tool)
        options.signal.addEventListener(
          'abort',
          () => tools.delete(tool.name),
          {
            once: true,
          },
        )
      },
    ),
  }

  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: modelContext,
  })
  return modelContext
}

function createFakeHandle() {
  const controller = new AbortController()
  const handle: Pick<Handle, 'signal'> = { signal: controller.signal }
  return { handle, abort: () => controller.abort() }
}

const statusTool = toolDefinition({
  name: 'status',
  description: 'Get the current status',
}).client(async () => ({ ok: true }))

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext')
})

describe('createWebMCPTools (Remix)', () => {
  it('uses the component Handle signal for cleanup', async () => {
    const modelContext = installModelContext()
    const { handle, abort } = createFakeHandle()

    createWebMCPTools(handle, [statusTool])
    await vi.waitFor(() => expect(modelContext.tools.has('status')).toBe(true))

    abort()
    expect(modelContext.tools.size).toBe(0)
  })

  it('reports asynchronous registration errors', async () => {
    installModelContext({ failOn: 'status' })
    const { handle } = createFakeHandle()
    const onError = vi.fn()

    createWebMCPTools(handle, [statusTool], { onError })

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(onError).toHaveBeenCalledWith(
      new Error('status registration failed'),
    )
  })

  it('does not report a pending registration error after cleanup', async () => {
    const modelContext = installModelContext({ keepRegistrationPending: true })
    const { handle, abort } = createFakeHandle()
    const onError = vi.fn()

    createWebMCPTools(handle, [statusTool], { onError })
    await vi.waitFor(() =>
      expect(modelContext.registerTool).toHaveBeenCalledOnce(),
    )

    abort()
    await new Promise((resolve) => setTimeout(resolve, 0))

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
    const options: CreateWebMCPToolsOptions<typeof tools> = {
      context: { tenantId: 'tenant-1' },
      toolOptions: { contextual: { title: 'Tenant status' } },
    }

    expectTypeOf(options.context).toEqualTypeOf<{ tenantId: string }>()

    const checkTypes = (handle: Pick<Handle, 'signal'>) => {
      // @ts-expect-error contextual tools require context
      createWebMCPTools(handle, tools)
      createWebMCPTools(handle, tools, options)
      createWebMCPTools(handle, tools, {
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
