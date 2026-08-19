import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MistralVertexAuthError,
  resolveMistralVertexAccessToken,
  resolveMistralVertexLocation,
  resolveMistralVertexModelUrl,
  resolveMistralVertexProject,
} from '../src/vertex/auth'

describe('resolveMistralVertexLocation', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads location from the factory', () => {
    expect(
      resolveMistralVertexLocation({
        project: 'my-project',
        location: 'europe-west4',
      }),
    ).toBe('europe-west4')
  })

  it('throws when location is missing', () => {
    expect(() =>
      resolveMistralVertexLocation({ project: 'my-project' }),
    ).toThrow(MistralVertexAuthError)
  })
})

describe('resolveMistralVertexModelUrl', () => {
  it('builds the publisher rawPredict host', () => {
    expect(
      resolveMistralVertexModelUrl('mistral-medium-3', {
        project: 'my-project',
        location: 'us-central1',
      }),
    ).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/publishers/mistralai/models/mistral-medium-3',
    )
  })
})

describe('resolveMistralVertexProject', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws when project is missing', () => {
    expect(() =>
      resolveMistralVertexModelUrl('mistral-medium-3', {
        location: 'us-central1',
      }),
    ).toThrow(MistralVertexAuthError)
  })

  it('reads GOOGLE_CLOUD_PROJECT', () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'env-project')
    expect(resolveMistralVertexProject({ location: 'us-central1' })).toBe(
      'env-project',
    )
  })
})

describe('resolveMistralVertexAccessToken', () => {
  it('uses getAccessToken when provided', async () => {
    await expect(
      resolveMistralVertexAccessToken({
        getAccessToken: async () => 'token-from-fn',
      }),
    ).resolves.toBe('token-from-fn')
  })

  it('reads a Bearer token from authClient', async () => {
    await expect(
      resolveMistralVertexAccessToken({
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
      resolveMistralVertexAccessToken({
        authClient: {
          async getRequestHeaders() {
            return new Headers()
          },
        },
      }),
    ).rejects.toThrow(MistralVertexAuthError)
  })
})
