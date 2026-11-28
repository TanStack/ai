import { renderHook } from '@solidjs/testing-library'
import { EventType } from '@tanstack/ai/client'
import { createEffect, createSignal, flush } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { GenerationClient } from '@tanstack/ai-client'
import type { ConnectConnectionAdapter } from '@tanstack/ai-client'
import type { useGeneration as UseGeneration } from '../src/use-generation'

const lifecycle = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}))
vi.mock('@tanstack/ai-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/ai-client')>()
  return {
    ...actual,
    GenerationClient: class extends actual.GenerationClient<
      Record<string, unknown>,
      unknown
    > {
      constructor(
        options: ConstructorParameters<
          typeof actual.GenerationClient<Record<string, unknown>, unknown>
        >[0],
      ) {
        super(options)
        const subscribe = this.subscribe
        this.subscribe = (listener) => {
          lifecycle.subscribe()
          listener()
          const stop = subscribe(listener)
          return () => {
            lifecycle.unsubscribe()
            stop()
          }
        }
      }
    },
  }
})

async function loadGeneration() {
  try {
    return (
      await vi.importActual<{ useGeneration: typeof UseGeneration }>(
        '../src/use-generation',
      )
    ).useGeneration
  } catch {
    return undefined
  }
}

describe('Solid 2 generation lifecycle', () => {
  it('seeds state, accepts a synchronous subscription, and batches snapshots', async () => {
    const useGeneration = await loadGeneration()
    expect(useGeneration).toBeTypeOf('function')
    if (!useGeneration) return

    lifecycle.subscribe.mockClear()
    lifecycle.unsubscribe.mockClear()
    const { subscribe, unsubscribe } = lifecycle
    const dispose = vi.spyOn(GenerationClient.prototype, 'dispose')
    const updates: Array<string> = []
    const { result, cleanup } = renderHook(() => {
      const hook = useGeneration({
        threadId: 'lifecycle',
        fetcher: async () => ({ value: 1 }),
      })
      expect(hook.status()).toBe('idle')
      createEffect(
        () => `${hook.status()}:${hook.isLoading()}`,
        (state) => {
          updates.push(state)
        },
      )
      return hook
    })
    flush()
    expect(subscribe).toHaveBeenCalledOnce()
    await result.generate({})
    flush()
    expect(result.result()).toEqual({ value: 1 })
    expect(updates).toContain('success:false')
    expect(updates).not.toContain('success:true')
    result.reset()
    expect(result.status()).toBe('success')
    flush()
    expect(result.status()).toBe('idle')
    cleanup()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
  })

  it('updates and clears reactive body at the generation transport boundary', async () => {
    const useGeneration = await loadGeneration()
    expect(useGeneration).toBeTypeOf('function')
    if (!useGeneration) return
    const requests = vi.fn()
    const connection: ConnectConnectionAdapter = {
      async *connect(_messages, data) {
        requests(data)
        yield { type: EventType.CUSTOM, name: 'generation:result', value: 'ok' }
        yield {
          type: EventType.RUN_FINISHED,
          threadId: 'options',
          runId: 'run',
        }
      },
    }
    const subscribe = lifecycle.subscribe.mockClear()
    const { result, cleanup } = renderHook(() => {
      const [body, setBody] = createSignal<{ model: string } | undefined>({
        model: 'first',
      })
      const generation = useGeneration({
        threadId: 'options',
        connection,
        get body() {
          return body()
        },
      })
      return { generation, setBody }
    })
    flush()
    await result.generation.generate({ prompt: 'first' })
    expect(requests).toHaveBeenLastCalledWith({
      model: 'first',
      prompt: 'first',
    })
    result.setBody({ model: 'second' })
    flush()
    await result.generation.generate({ prompt: 'second' })
    expect(requests).toHaveBeenLastCalledWith({
      model: 'second',
      prompt: 'second',
    })
    result.setBody(undefined)
    flush()
    await result.generation.generate({ prompt: 'cleared' })
    expect(requests).toHaveBeenLastCalledWith({ prompt: 'cleared' })
    expect(subscribe).toHaveBeenCalledOnce()
    cleanup()
  })
})
