// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/preact'
import { toolDefinition } from '@tanstack/ai/client'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { useWebMCPTools } from '../src'
import type { AnyClientTool } from '@tanstack/ai/client'
import type { UseWebMCPToolsOptions } from '../src'

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

describe('useWebMCPTools', () => {
  it('removes registered tools on unmount', async () => {
    const modelContext = installModelContext()
    const tools = [statusTool] as const
    const { unmount } = renderHook(() => useWebMCPTools(tools))

    await waitFor(() => expect(modelContext.tools.has('status')).toBe(true))
    unmount()

    expect(modelContext.tools.size).toBe(0)
  })

  it('replaces registered tools when the list changes', async () => {
    const modelContext = installModelContext()
    const initialTools: ReadonlyArray<AnyClientTool> = [firstTool]
    const nextTools: ReadonlyArray<AnyClientTool> = [secondTool]
    const { rerender, unmount } = renderHook(
      (tools: ReadonlyArray<AnyClientTool>) => useWebMCPTools(tools),
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
    const initialOptions: UseWebMCPToolsOptions<typeof tools> = {
      toolOptions: { status: { title: 'Initial status' } },
    }
    const nextOptions: UseWebMCPToolsOptions<typeof tools> = {
      toolOptions: { status: { title: 'Current status' } },
    }
    const { rerender, unmount } = renderHook(
      (options: UseWebMCPToolsOptions<typeof tools>) =>
        useWebMCPTools(tools, options),
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
    const { unmount } = renderHook(() => useWebMCPTools(tools, { onError }))

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
        useWebMCPTools(tools, { onError }),
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
    const options: UseWebMCPToolsOptions<typeof tools> = {
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
      useWebMCPTools(tools, {
        toolOptions: {
          // @ts-expect-error options only accept names from the tool list
          unknown: {},
        },
      })
      // @ts-expect-error contextual tools require context
      useWebMCPTools(contextualTools)
      useWebMCPTools(contextualTools, { context: { tenantId: 'tenant-1' } })
    }
    void checkCalls
  })
})
