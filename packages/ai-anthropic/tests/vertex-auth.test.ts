import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AnthropicVertexAuthError,
  resolveAnthropicVertexOptions,
} from '../src/vertex/auth'

describe('resolveAnthropicVertexOptions', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('maps project and location onto AnthropicVertex options', () => {
    const options = resolveAnthropicVertexOptions({
      project: 'my-project',
      location: 'europe-west1',
    })

    expect(options).toEqual({
      projectId: 'my-project',
      region: 'europe-west1',
    })
  })

  it('reads Google Cloud env vars', () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'env-project')
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'us-east5')

    const options = resolveAnthropicVertexOptions()

    expect(options.projectId).toBe('env-project')
    expect(options.region).toBe('us-east5')
  })

  it('throws when location is missing', () => {
    expect(() =>
      resolveAnthropicVertexOptions({ project: 'my-project' }),
    ).toThrow(AnthropicVertexAuthError)
    expect(() =>
      resolveAnthropicVertexOptions({ project: 'my-project' }),
    ).toThrow(/needs a location/)
  })

  it('allows a missing project so ADC can fill it later', () => {
    const options = resolveAnthropicVertexOptions({
      location: 'europe-west1',
    })

    expect(options.projectId).toBeNull()
    expect(options.region).toBe('europe-west1')
  })
})
