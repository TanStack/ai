import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveVertexGeminiOptions } from '../src/auth'
import { VertexAuthError } from '../src/errors'

const VERTEX_ENV = [
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_VERTEX_PROJECT',
  'GOOGLE_CLOUD_LOCATION',
  'GOOGLE_VERTEX_LOCATION',
  'GOOGLE_VERTEX_API_KEY',
] as const

describe('resolveVertexGeminiOptions', () => {
  beforeEach(() => {
    for (const name of VERTEX_ENV) {
      vi.stubEnv(name, '')
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses factory project and location and sets vertexai', () => {
    const options = resolveVertexGeminiOptions({
      project: 'my-project',
      location: 'europe-west1',
    })

    expect(options).toEqual({
      project: 'my-project',
      location: 'europe-west1',
      vertexai: true,
    })
  })

  it('reads project and location from the environment', () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'env-project')
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'us-central1')

    const options = resolveVertexGeminiOptions()

    expect(options).toEqual({
      project: 'env-project',
      location: 'us-central1',
      vertexai: true,
    })
  })

  it('lets factory fields win over env', () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'env-project')
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'us-central1')

    const options = resolveVertexGeminiOptions({
      project: 'factory-project',
      location: 'europe-west1',
    })

    expect(options.project).toBe('factory-project')
    expect(options.location).toBe('europe-west1')
  })

  it('accepts an express apiKey without project or location', () => {
    const options = resolveVertexGeminiOptions({
      apiKey: 'express-key',
    })

    expect(options).toEqual({
      apiKey: 'express-key',
      vertexai: true,
    })
  })

  it('reads GOOGLE_VERTEX_API_KEY for express mode', () => {
    vi.stubEnv('GOOGLE_VERTEX_API_KEY', 'env-express-key')

    const options = resolveVertexGeminiOptions()

    expect(options.apiKey).toBe('env-express-key')
    expect(options.vertexai).toBe(true)
  })

  it('does not read GEMINI_API_KEY', () => {
    vi.stubEnv('GEMINI_API_KEY', 'studio-key')

    expect(() => resolveVertexGeminiOptions()).toThrow(VertexAuthError)
  })

  it('throws when project, location, and express apiKey are all missing', () => {
    expect(() => resolveVertexGeminiOptions()).toThrow(VertexAuthError)
    expect(() => resolveVertexGeminiOptions()).toThrow(
      /project and location, or an express apiKey/,
    )
  })

  it('treats empty factory credentials as absent and falls back to env', () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'env-project')
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'us-central1')
    vi.stubEnv('GOOGLE_VERTEX_API_KEY', 'env-express-key')

    const options = resolveVertexGeminiOptions({
      project: '',
      location: '',
      apiKey: '',
    })

    expect(options).toEqual({
      project: 'env-project',
      location: 'us-central1',
      apiKey: 'env-express-key',
      vertexai: true,
    })
  })

  it('throws when factory credentials are empty and env is empty', () => {
    expect(() =>
      resolveVertexGeminiOptions({
        project: '',
        location: '',
        apiKey: '',
      }),
    ).toThrow(VertexAuthError)
  })

  it('forwards googleAuthOptions', () => {
    const googleAuthOptions = {
      keyFilename: '/path/to/sa.json',
    }

    const options = resolveVertexGeminiOptions({
      project: 'my-project',
      location: 'europe-west1',
      googleAuthOptions,
    })

    expect(options.googleAuthOptions).toBe(googleAuthOptions)
  })
})
