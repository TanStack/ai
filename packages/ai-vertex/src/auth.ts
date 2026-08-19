import { VertexAuthError } from './errors'
import type { GeminiClientConfig } from '@tanstack/ai-gemini'

export type VertexClientConfig = Omit<
  GeminiClientConfig,
  'vertexai' | 'enterprise'
>

export type VertexVideoConfig = VertexClientConfig & {
  allowUrlFetch?: boolean
}

function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || process.env === undefined) {
    return undefined
  }
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    return undefined
  }
  return value
}

/**
 * Resolves Vertex Gemini client options.
 *
 * Factory fields win. Then env. Then ADC inside `@google/genai`.
 * Does not read `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
 */
export function resolveVertexGeminiOptions(
  config: VertexClientConfig = {},
): GeminiClientConfig {
  const project =
    config.project ??
    readEnv('GOOGLE_CLOUD_PROJECT') ??
    readEnv('GOOGLE_VERTEX_PROJECT')
  const location =
    config.location ??
    readEnv('GOOGLE_CLOUD_LOCATION') ??
    readEnv('GOOGLE_VERTEX_LOCATION')
  const apiKey = config.apiKey ?? readEnv('GOOGLE_VERTEX_API_KEY')

  if (
    apiKey === undefined &&
    (project === undefined || location === undefined)
  ) {
    throw new VertexAuthError(
      'Vertex Gemini needs project and location, or an express apiKey. Pass project and location on the factory, or set GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION. For express mode, pass apiKey or set GOOGLE_VERTEX_API_KEY.',
    )
  }

  return {
    ...config,
    vertexai: true,
    ...(project === undefined ? {} : { project }),
    ...(location === undefined ? {} : { location }),
    ...(apiKey === undefined ? {} : { apiKey }),
  }
}
