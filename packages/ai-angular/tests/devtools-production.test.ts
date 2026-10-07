import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createChatDevtoolsBridge,
  createGenerationDevtoolsBridge,
  createVideoDevtoolsBridge,
} from '@tanstack/ai-client/devtools'
import { injectGeneration } from '../src/inject-generation'
import { injectGenerateVideo } from '../src/inject-generate-video'
import { createMockConnectionAdapter, renderInjectChat } from './test-utils'

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

@Component({ standalone: true, template: '' })
class GenerationHost {
  gen = injectGeneration({ connection: createMockConnectionAdapter() })
  video = injectGenerateVideo({ connection: createMockConnectionAdapter() })
}

function renderAll() {
  renderInjectChat({ connection: createMockConnectionAdapter() })
  TestBed.createComponent(GenerationHost).detectChanges()
}

describe('devtools bridge by NODE_ENV', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('does not create devtools bridges in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    renderAll()

    expect(createChatDevtoolsBridge).not.toHaveBeenCalled()
    expect(createGenerationDevtoolsBridge).not.toHaveBeenCalled()
    expect(createVideoDevtoolsBridge).not.toHaveBeenCalled()
  })

  it('creates devtools bridges in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    renderAll()

    expect(createChatDevtoolsBridge).toHaveBeenCalled()
    expect(createGenerationDevtoolsBridge).toHaveBeenCalled()
    expect(createVideoDevtoolsBridge).toHaveBeenCalled()
  })
})
