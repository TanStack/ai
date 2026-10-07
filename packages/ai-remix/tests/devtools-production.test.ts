import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createChatDevtoolsBridge,
  createGenerationDevtoolsBridge,
  createVideoDevtoolsBridge,
} from '@tanstack/ai-client/devtools'
import { createChat } from '../src/create-chat'
import { createGeneration } from '../src/create-generation'
import { createGenerateVideo } from '../src/create-generate-video'
import type { Handle } from 'remix/ui'

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

const abortControllers: Array<AbortController> = []

function createHandle() {
  const abort = new AbortController()
  abortControllers.push(abort)
  const frame = Object.assign(new EventTarget(), {
    src: '',
    reload: async () => abort.signal,
    replace: async () => {},
  })
  const handle: Handle = {
    id: 'handle-1',
    update: vi.fn(async () => abort.signal),
    signal: abort.signal,
    props: {},
    context: {
      set() {},
      get() {
        return undefined
      },
    },
    queueTask() {},
    frame,
    frames: {
      top: frame,
      get() {
        return undefined
      },
    },
  }
  return handle
}

function createConnection() {
  return {
    async *connect() {},
  }
}

function createClients() {
  createChat(createHandle(), { connection: createConnection() })
  createGeneration(createHandle(), { connection: createConnection() })
  createGenerateVideo(createHandle(), { connection: createConnection() })
}

describe('devtools bridge by NODE_ENV', () => {
  afterEach(() => {
    for (const abort of abortControllers) {
      abort.abort()
    }
    abortControllers.length = 0
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('does not create devtools bridges in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    createClients()

    expect(createChatDevtoolsBridge).not.toHaveBeenCalled()
    expect(createGenerationDevtoolsBridge).not.toHaveBeenCalled()
    expect(createVideoDevtoolsBridge).not.toHaveBeenCalled()
  })

  it('creates devtools bridges in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    createClients()

    expect(createChatDevtoolsBridge).toHaveBeenCalled()
    expect(createGenerationDevtoolsBridge).toHaveBeenCalled()
    expect(createVideoDevtoolsBridge).toHaveBeenCalled()
  })
})
