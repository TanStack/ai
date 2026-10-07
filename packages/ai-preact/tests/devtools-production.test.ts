import { renderHook } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { useChat } from '../src/use-chat'
import { createMockConnectionAdapter } from './test-utils'

vi.mock('@tanstack/ai-client/devtools', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/ai-client/devtools')>()
  return {
    ...actual,
    createChatDevtoolsBridge: vi.fn(actual.createChatDevtoolsBridge),
  }
})

describe('devtools bridge by NODE_ENV', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('does not create a devtools bridge in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    renderHook(() => useChat({ connection: createMockConnectionAdapter() }))

    expect(createChatDevtoolsBridge).not.toHaveBeenCalled()
  })

  it('creates a devtools bridge in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    renderHook(() => useChat({ connection: createMockConnectionAdapter() }))

    expect(createChatDevtoolsBridge).toHaveBeenCalled()
  })
})
