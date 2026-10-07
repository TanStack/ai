import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createChatDevtoolsBridge,
  createGenerationDevtoolsBridge,
  createVideoDevtoolsBridge,
} from '@tanstack/ai-client/devtools'
import { createChat } from '../src/create-chat.svelte'
import { createGeneration } from '../src/create-generation.svelte'
import { createGenerateVideo } from '../src/create-generate-video.svelte'
import { createMockConnectionAdapter } from './test-utils'

vi.mock('@tanstack/ai-client/devtools', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/ai-client/devtools')>()
  return {
    ...actual,
    createChatDevtoolsBridge: vi.fn(actual.createChatDevtoolsBridge),
    createGenerationDevtoolsBridge: vi.fn(
      actual.createGenerationDevtoolsBridge,
    ),
    createVideoDevtoolsBridge: vi.fn(actual.createVideoDevtoolsBridge),
  }
})

function createAll() {
  createChat({ connection: createMockConnectionAdapter() })
  createGeneration({ connection: createMockConnectionAdapter() })
  createGenerateVideo({ connection: createMockConnectionAdapter() })
}

describe('devtools bridge by NODE_ENV', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('does not create devtools bridges in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    createAll()

    expect(createChatDevtoolsBridge).not.toHaveBeenCalled()
    expect(createGenerationDevtoolsBridge).not.toHaveBeenCalled()
    expect(createVideoDevtoolsBridge).not.toHaveBeenCalled()
  })

  it('creates devtools bridges in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    createAll()

    expect(createChatDevtoolsBridge).toHaveBeenCalled()
    expect(createGenerationDevtoolsBridge).toHaveBeenCalled()
    expect(createVideoDevtoolsBridge).toHaveBeenCalled()
  })
})
