import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GrokVertexAuthError,
  resolveGrokVertexAccessToken,
  resolveGrokVertexBaseURL,
  resolveGrokVertexProject,
  toVertexGrokModelId,
} from '../src/vertex/auth'

describe('resolveGrokVertexBaseURL', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds the global OpenAI-compatible Vertex URL', () => {
    expect(
      resolveGrokVertexBaseURL({
        project: 'my-project',
        location: 'global',
      }),
    ).toBe(
      'https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/endpoints/openapi',
    )
  })

  it('defaults location to global', () => {
    expect(resolveGrokVertexBaseURL({ project: 'my-project' })).toContain(
      '/locations/global/endpoints/openapi',
    )
  })

  it('builds a regional Vertex URL', () => {
    expect(
      resolveGrokVertexBaseURL({
        project: 'my-project',
        location: 'us-central1',
      }),
    ).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/endpoints/openapi',
    )
  })

  it('lets an explicit baseURL win', () => {
    expect(
      resolveGrokVertexBaseURL({
        baseURL: 'http://127.0.0.1:4010/v1/',
      }),
    ).toBe('http://127.0.0.1:4010/v1')
  })

  it('throws when project and baseURL are both missing', () => {
    expect(() => resolveGrokVertexBaseURL({})).toThrow(GrokVertexAuthError)
  })
})

describe('toVertexGrokModelId', () => {
  it('prefixes a bare Grok model id', () => {
    expect(toVertexGrokModelId('grok-4.3')).toBe('xai/grok-4.3')
  })

  it('keeps an already-prefixed id', () => {
    expect(toVertexGrokModelId('xai/grok-4.3')).toBe('xai/grok-4.3')
  })
})

describe('resolveGrokVertexAccessToken', () => {
  it('uses getAccessToken when provided', async () => {
    await expect(
      resolveGrokVertexAccessToken({
        getAccessToken: async () => 'token-from-fn',
      }),
    ).resolves.toBe('token-from-fn')
  })

  it('reads a Bearer token from authClient', async () => {
    await expect(
      resolveGrokVertexAccessToken({
        authClient: {
          async getRequestHeaders() {
            return new Headers({ Authorization: 'Bearer token-from-client' })
          },
        },
      }),
    ).resolves.toBe('token-from-client')
  })

  it('throws when authClient has no Bearer token', async () => {
    await expect(
      resolveGrokVertexAccessToken({
        authClient: {
          async getRequestHeaders() {
            return new Headers()
          },
        },
      }),
    ).rejects.toThrow(GrokVertexAuthError)
  })
})

describe('resolveGrokVertexProject', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads GOOGLE_CLOUD_PROJECT when project is omitted', () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'env-project')
    expect(resolveGrokVertexProject({})).toBe('env-project')
  })
})
