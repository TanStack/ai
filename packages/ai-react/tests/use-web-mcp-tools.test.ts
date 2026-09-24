// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { toolDefinition } from '@tanstack/ai/client'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  usePageWebMCPTools,
  useRegisterWebMCPTools,
  useWebMCPTools,
} from '../src'
import type { AnyClientTool } from '@tanstack/ai/client'
import type { UseRegisterWebMCPToolsOptions } from '../src'

interface RegisteredWebMCPTool {
  name: string
  title?: string
}

interface ModelContextOptions {
  failOn?: string
  pending?: boolean
}

function installModelContext({ failOn, pending }: ModelContextOptions = {}) {
  const tools = new Map<string, RegisteredWebMCPTool>()
  const modelContext = {
    tools,
    async registerTool(
      tool: RegisteredWebMCPTool,
      options: { signal: AbortSignal },
    ) {
      if (tool.name === failOn) {
        throw new Error(`${tool.name} registration failed`)
      }

      tools.set(tool.name, tool)
      if (pending) {
        await new Promise<void>((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              tools.delete(tool.name)
              reject(new Error(`${tool.name} registration aborted`))
            },
            { once: true },
          )
        })
        return
      }

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
  description: 'Read the status',
}).client(async () => ({ ok: true }))
const firstTool = toolDefinition({
  name: 'first',
  description: 'Run the first tool',
}).client(async () => 'first')
const secondTool = toolDefinition({
  name: 'second',
  description: 'Run the second tool',
}).client(async () => 'second')

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext')
})

describe('useRegisterWebMCPTools', () => {
  it('removes registered tools on unmount', async () => {
    const modelContext = installModelContext()
    const tools = [statusTool] as const
    const { unmount } = renderHook(() => useRegisterWebMCPTools(tools))

    await waitFor(() => expect(modelContext.tools.has('status')).toBe(true))
    unmount()

    expect(modelContext.tools.size).toBe(0)
  })

  it('replaces registered tools when the list changes', async () => {
    const modelContext = installModelContext()
    const initialTools: ReadonlyArray<AnyClientTool> = [firstTool]
    const nextTools: ReadonlyArray<AnyClientTool> = [secondTool]
    const { rerender, unmount } = renderHook(
      (tools: ReadonlyArray<AnyClientTool>) => useRegisterWebMCPTools(tools),
      { initialProps: initialTools },
    )

    await waitFor(() =>
      expect([...modelContext.tools.keys()]).toEqual(['first']),
    )
    rerender(nextTools)
    await waitFor(() =>
      expect([...modelContext.tools.keys()]).toEqual(['second']),
    )
    unmount()
  })

  it('replaces registered tools when options change', async () => {
    const modelContext = installModelContext()
    const tools = [statusTool] as const
    const initialOptions: UseRegisterWebMCPToolsOptions<typeof tools> = {
      toolOptions: { status: { title: 'Initial status' } },
    }
    const nextOptions: UseRegisterWebMCPToolsOptions<typeof tools> = {
      toolOptions: { status: { title: 'Current status' } },
    }
    const { rerender, unmount } = renderHook(
      (options: UseRegisterWebMCPToolsOptions<typeof tools>) =>
        useRegisterWebMCPTools(tools, options),
      { initialProps: initialOptions },
    )

    await waitFor(() =>
      expect(modelContext.tools.get('status')?.title).toBe('Initial status'),
    )
    rerender(nextOptions)
    await waitFor(() =>
      expect(modelContext.tools.get('status')?.title).toBe('Current status'),
    )
    unmount()
  })

  it('reports asynchronous registration failures', async () => {
    installModelContext({ failOn: 'status' })
    const onError = vi.fn<(error: unknown) => void>()
    const tools = [statusTool] as const
    const { unmount } = renderHook(() =>
      useRegisterWebMCPTools(tools, { onError }),
    )

    await waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'status registration failed' }),
    )
    unmount()
  })

  it('does not report aborted pending registrations', async () => {
    const modelContext = installModelContext({ pending: true })
    const onError = vi.fn<(error: unknown) => void>()
    const initialTools: ReadonlyArray<AnyClientTool> = [firstTool]
    const nextTools: ReadonlyArray<AnyClientTool> = [secondTool]
    const { rerender, unmount } = renderHook(
      (tools: ReadonlyArray<AnyClientTool>) =>
        useRegisterWebMCPTools(tools, { onError }),
      { initialProps: initialTools },
    )

    await waitFor(() => expect(modelContext.tools.has('first')).toBe(true))
    rerender(nextTools)
    await waitFor(() => expect(modelContext.tools.has('second')).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onError).not.toHaveBeenCalled()

    unmount()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(modelContext.tools.size).toBe(0)
    expect(onError).not.toHaveBeenCalled()
  })

  it('preserves inferred tool options and required context', () => {
    const tools = [statusTool, firstTool] as const
    const options: UseRegisterWebMCPToolsOptions<typeof tools> = {
      toolOptions: { status: { title: 'Status' } },
    }
    expectTypeOf(options.toolOptions?.status?.title).toEqualTypeOf<
      string | undefined
    >()

    const contextualTool = toolDefinition({
      name: 'contextual',
      description: 'Read tenant context',
    }).client<{ tenantId: string }>(
      (_input, context) => context.context.tenantId,
    )
    const contextualTools = [contextualTool] as const
    const checkCalls = () => {
      useRegisterWebMCPTools(tools, {
        toolOptions: {
          // @ts-expect-error options only accept names from the tool list
          unknown: {},
        },
      })
      // @ts-expect-error contextual tools require context
      useRegisterWebMCPTools(contextualTools)
      useRegisterWebMCPTools(contextualTools, {
        context: { tenantId: 'tenant-1' },
      })
    }
    void checkCalls
  })
})

describe('useWebMCPTools', () => {
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

describe('usePageWebMCPTools', () => {
  it('returns filtered page tools and updates on toolchange', async () => {
    const modelContext = installPageTools(['first', 'blocked'])
    const { result, unmount } = renderHook(() =>
      usePageWebMCPTools({ filter: (tool) => tool.name !== 'blocked' }),
    )

    expect(result.current).toEqual([])
    await waitFor(() =>
      expect(result.current.map((tool) => tool.name)).toEqual(['first']),
    )
    modelContext.change(['first', 'second'])
    await waitFor(() =>
      expect(result.current.map((tool) => tool.name)).toEqual([
        'first',
        'second',
      ]),
    )
    await expect(result.current[0]?.execute?.({})).resolves.toBe('done')
    unmount()
  })
})
