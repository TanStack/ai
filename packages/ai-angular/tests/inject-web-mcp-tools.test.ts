import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { toolDefinition } from '@tanstack/ai/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { injectWebMCPTools, type InjectWebMCPToolsOptions } from '../src'

interface RegisteredWebMCPTool {
  name: string
  title?: string
  description: string
  execute: (input: object, options: { signal: AbortSignal }) => Promise<unknown>
}

interface ModelContextOptions {
  failOn?: string
  pendingUntilAbort?: string
}

function installModelContext({
  failOn,
  pendingUntilAbort,
}: ModelContextOptions = {}) {
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
      if (tool.name === pendingUntilAbort) {
        await new Promise<void>((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new Error(`${tool.name} registration aborted`)),
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
  vi.stubGlobal('isSecureContext', true)
  return modelContext
}

function createInjectionOwner(register: () => void) {
  @Component({ standalone: true, template: '' })
  class Host {
    registration = register()
  }

  const fixture = TestBed.createComponent(Host)
  fixture.detectChanges()
  return fixture
}

const statusTool = toolDefinition({
  name: 'status',
  description: 'Read the current status',
}).client(async () => ({ status: 'ready' }))

afterEach(() => {
  TestBed.resetTestingModule()
  Reflect.deleteProperty(document, 'modelContext')
  vi.unstubAllGlobals()
})

describe('injectWebMCPTools', () => {
  it('registers client tools with their inferred options', async () => {
    const modelContext = installModelContext()
    createInjectionOwner(() =>
      injectWebMCPTools([statusTool], {
        toolOptions: { status: { title: 'Current status' } },
      }),
    )

    await vi.waitFor(() => expect(modelContext.tools.has('status')).toBe(true))
    expect(modelContext.tools.get('status')).toMatchObject({
      name: 'status',
      title: 'Current status',
      description: 'Read the current status',
    })
  })

  it('removes registered tools when the injection owner is destroyed', async () => {
    const modelContext = installModelContext()
    const fixture = createInjectionOwner(() => injectWebMCPTools([statusTool]))
    await vi.waitFor(() => expect(modelContext.tools.has('status')).toBe(true))

    fixture.destroy()

    expect(modelContext.tools.size).toBe(0)
  })

  it('reports asynchronous registration errors', async () => {
    installModelContext({ failOn: 'status' })
    const onError = vi.fn()
    createInjectionOwner(() => injectWebMCPTools([statusTool], { onError }))

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'status registration failed' }),
    )
  })

  it('does not report a pending registration error after destruction', async () => {
    installModelContext({ pendingUntilAbort: 'status' })
    const onError = vi.fn()
    const fixture = createInjectionOwner(() =>
      injectWebMCPTools([statusTool], { onError }),
    )

    fixture.destroy()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onError).not.toHaveBeenCalled()
  })

  it('preserves inferred tool options and required runtime context', () => {
    const contextualTool = toolDefinition({
      name: 'tenant_status',
      description: 'Read tenant status',
    }).client<{ tenantId: string }>((_input, context) => {
      return context.context.tenantId
    })

    function _scenario() {
      const options: InjectWebMCPToolsOptions<
        readonly [typeof contextualTool]
      > = {
        context: { tenantId: 'tenant-1' },
        toolOptions: { tenant_status: { title: 'Tenant status' } },
      }
      injectWebMCPTools([contextualTool], options)

      // @ts-expect-error contextual tools require runtime context
      injectWebMCPTools([contextualTool])
      injectWebMCPTools([contextualTool], {
        context: { tenantId: 'tenant-1' },
        toolOptions: {
          // @ts-expect-error tool options only accept inferred tool names
          unknown_tool: {},
        },
      })
    }

    void _scenario
  })

  it('throws outside an injection context', () => {
    expect(() => injectWebMCPTools([statusTool])).toThrow()
  })
})
