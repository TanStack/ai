import { toolDefinition } from '@tanstack/ai/client'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type * as Svelte from 'svelte'
import type { CreateRegisterWebMCPToolsOptions } from '../src/create-web-mcp-tools.svelte'

const svelteClient: typeof Svelte = await import(
  // @ts-expect-error The client entry has no declaration, so use the public module type.
  '../node_modules/svelte/src/index-client.js'
)
vi.doMock('svelte', () => svelteClient)

const { mount, unmount } = svelteClient
const { createRegisterWebMCPTools, createWebMCPTools } =
  await import('../src/index')
const { default: WebMCPToolsFixture } =
  await import('./fixtures/web-mcp-tools.svelte')
const { default: PageWebMCPToolsFixture } =
  await import('./fixtures/page-web-mcp-tools.svelte')
const { ChatClient } = await import('@tanstack/ai-client')
const { createMockConnectionAdapter } = await import('./test-utils')

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

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext')
  document.body.replaceChildren()
})

describe('createRegisterWebMCPTools (Svelte)', () => {
  it('removes registered tools when the component unmounts', async () => {
    const modelContext = installModelContext()
    const component = mount(WebMCPToolsFixture, { target: document.body })

    await vi.waitFor(() => expect(modelContext.tools.has('status')).toBe(true))
    await unmount(component)

    expect(modelContext.tools.size).toBe(0)
  })

  it('reports asynchronous registration errors', async () => {
    installModelContext({ failOn: 'status' })
    const onError = vi.fn()
    const component = mount(WebMCPToolsFixture, {
      target: document.body,
      props: { onError },
    })

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(onError).toHaveBeenCalledWith(
      new Error('status registration failed'),
    )
    await unmount(component)
  })

  it('does not report a pending registration error after unmount', async () => {
    const modelContext = installModelContext({ keepRegistrationPending: true })
    const onError = vi.fn()
    const component = mount(WebMCPToolsFixture, {
      target: document.body,
      props: { onError },
    })

    await vi.waitFor(() =>
      expect(modelContext.registerTool).toHaveBeenCalledOnce(),
    )
    await unmount(component)
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
    const options: CreateRegisterWebMCPToolsOptions<typeof tools> = {
      context: { tenantId: 'tenant-1' },
      toolOptions: { contextual: { title: 'Tenant status' } },
    }

    expectTypeOf(options.context).toEqualTypeOf<{ tenantId: string }>()

    const checkTypes = () => {
      // @ts-expect-error contextual tools require context
      createRegisterWebMCPTools(tools)
      createRegisterWebMCPTools(tools, options)
      createRegisterWebMCPTools(tools, {
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

describe('createWebMCPTools (Svelte)', () => {
  it('is a deprecated alias of createRegisterWebMCPTools', () => {
    expect(createWebMCPTools).toBe(createRegisterWebMCPTools)
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

describe('createPageWebMCPTools (Svelte)', () => {
  it('returns filtered page tools, updates on toolchange, and syncs createChat', async () => {
    const modelContext = installPageTools(['first', 'blocked'])
    const updateOptions = vi.spyOn(ChatClient.prototype, 'updateOptions')
    let tools: Array<{ name: string; execute?: (input: unknown) => unknown }> =
      []
    const component = mount(PageWebMCPToolsFixture, {
      target: document.body,
      props: {
        connection: createMockConnectionAdapter(),
        onTools: (nextTools) => (tools = nextTools),
      },
    })

    await vi.waitFor(() =>
      expect(tools.map((tool) => tool.name)).toEqual(['first']),
    )
    modelContext.change(['first', 'second'])
    await vi.waitFor(() => expect(tools).toHaveLength(2))
    await vi.waitFor(() =>
      expect(updateOptions).toHaveBeenCalledWith({ tools }),
    )
    await expect(tools[0]?.execute?.({})).resolves.toBe('done')

    await unmount(component)
    updateOptions.mockRestore()
  })
})
