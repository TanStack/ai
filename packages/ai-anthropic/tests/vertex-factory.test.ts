import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANTHROPIC_VERTEX_CHAT_MODELS,
  anthropicVertexText,
} from '../src/vertex'

const mocks = vi.hoisted(() => {
  return {
    constructorSpy: vi.fn<(options: Record<string, unknown>) => void>(),
    create: vi.fn(),
  }
})

vi.mock('@anthropic-ai/vertex-sdk', () => {
  class MockAnthropicVertex {
    public beta = {
      messages: {
        create: mocks.create,
      },
    }

    constructor(options: Record<string, unknown>) {
      mocks.constructorSpy(options)
    }
  }

  return {
    AnthropicVertex: MockAnthropicVertex,
  }
})

describe('ANTHROPIC_VERTEX_CHAT_MODELS', () => {
  it('does not include Anthropic-only model ids', () => {
    expect(ANTHROPIC_VERTEX_CHAT_MODELS).toContain('claude-sonnet-5')
    expect(ANTHROPIC_VERTEX_CHAT_MODELS).toContain('claude-opus-5')
    expect(ANTHROPIC_VERTEX_CHAT_MODELS).not.toContain('claude-opus-5-fast')
  })
})

describe('anthropicVertexText', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('constructs AnthropicVertex and returns an anthropic adapter', () => {
    const adapter = anthropicVertexText('claude-sonnet-5', {
      project: 'my-project',
      location: 'europe-west1',
    })

    expect(adapter.name).toBe('anthropic')
    expect(adapter.model).toBe('claude-sonnet-5')
    expect(mocks.constructorSpy).toHaveBeenCalledExactlyOnceWith({
      projectId: 'my-project',
      region: 'europe-west1',
    })
  })
})
