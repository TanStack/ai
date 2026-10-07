import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createChatDevtoolsBridge,
  createGenerationDevtoolsBridge,
  createVideoDevtoolsBridge,
} from '@tanstack/ai-client/devtools'
import { useChat } from '../src/use-chat'
import { useGeneration } from '../src/use-generation'
import { useGenerateVideo } from '../src/use-generate-video'
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

function renderHooks() {
  mount(
    defineComponent({
      setup() {
        useChat({ connection: createMockConnectionAdapter() })
        useGeneration({ connection: createMockConnectionAdapter() })
        useGenerateVideo({ connection: createMockConnectionAdapter() })
        return {}
      },
      template: '<div></div>',
    }),
  )
}

describe('devtools bridge by NODE_ENV', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('does not create devtools bridges in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    renderHooks()

    expect(createChatDevtoolsBridge).not.toHaveBeenCalled()
    expect(createGenerationDevtoolsBridge).not.toHaveBeenCalled()
    expect(createVideoDevtoolsBridge).not.toHaveBeenCalled()
  })

  it('creates devtools bridges in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    renderHooks()

    expect(createChatDevtoolsBridge).toHaveBeenCalled()
    expect(createGenerationDevtoolsBridge).toHaveBeenCalled()
    expect(createVideoDevtoolsBridge).toHaveBeenCalled()
  })
})
