import { renderHook } from '@octanejs/testing-library'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChat } from '../../src/use-chat.tsrx'
import { useGeneration } from '../../src/use-generation.tsrx'
import { createMockConnectionAdapter } from './test-utils'

/**
 * These hooks tag the TanStack AI Devtools bridge with `framework: 'octane'` so
 * the devtools attribute activity to this binding rather than to React. The tag
 * is hardcoded, which means it has to win over anything a caller passes in
 * `devtools` — `useGeneration` in particular is documented as public API for
 * custom generation types, so callers do supply their own `devtools` metadata.
 *
 * Capture the options each bridge factory receives and assert the identity
 * survives, then delegate to the real factory so the clients still work.
 */
const capturedGeneration: Array<Record<string, any>> = []
const capturedChat: Array<Record<string, any>> = []

vi.mock('@tanstack/ai-client/devtools', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/ai-client/devtools')>()
  return {
    ...actual,
    createGenerationDevtoolsBridge: (options: any) => {
      capturedGeneration.push(options)
      return actual.createGenerationDevtoolsBridge(options)
    },
    createChatDevtoolsBridge: (options: any) => {
      capturedChat.push(options)
      return actual.createChatDevtoolsBridge(options)
    },
  }
})

describe('devtools identification', () => {
  beforeEach(() => {
    capturedGeneration.length = 0
    capturedChat.length = 0
  })

  it('tags useGeneration as octane', () => {
    renderHook(() =>
      useGeneration({ connection: createMockConnectionAdapter() }),
    )

    expect(capturedGeneration[0]?.metadata).toMatchObject({
      framework: 'octane',
      hookName: 'useGeneration',
    })
  })

  it('keeps the octane identity when a caller supplies its own devtools metadata', () => {
    renderHook(() =>
      useGeneration({
        connection: createMockConnectionAdapter(),
        devtools: { framework: 'react', hookName: 'somethingElse' },
      }),
    )

    // A caller must not be able to misattribute this binding.
    expect(capturedGeneration[0]?.metadata).toMatchObject({
      framework: 'octane',
      hookName: 'useGeneration',
    })
  })

  it('preserves unrelated caller devtools metadata', () => {
    renderHook(() =>
      useGeneration({
        connection: createMockConnectionAdapter(),
        devtools: { outputKind: 'image' },
      }),
    )

    expect(capturedGeneration[0]?.metadata).toMatchObject({
      framework: 'octane',
      outputKind: 'image',
    })
  })

  it('tags useChat as octane and resists caller override', () => {
    renderHook(() =>
      useChat({
        connection: createMockConnectionAdapter(),
        devtools: { framework: 'react' },
      }),
    )

    expect(capturedChat[0]?.metadata).toMatchObject({
      framework: 'octane',
      hookName: 'useChat',
    })
  })
})
