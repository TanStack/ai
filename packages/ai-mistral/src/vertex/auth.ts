export class MistralVertexAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MistralVertexAuthError'
  }
}

export type VertexAuthClient = {
  getRequestHeaders: (url?: string | URL) => Promise<Headers>
}

/**
 * Public Vertex config for Mistral. `project` and `location` match the
 * Gemini Vertex factories so one auth object works for both.
 *
 * Mistral on Vertex is regional only (`us-central1`, `europe-west4`).
 * There is no global endpoint.
 */
export type MistralVertexConfig = {
  project?: string
  location?: string
  /**
   * Override the chat completions URL. When set, the Vertex
   * `:rawPredict` / `:streamRawPredict` rewrite is skipped. Used by e2e.
   */
  resolveRequestUrl?: (stream: boolean) => string
  getAccessToken?: () => Promise<string>
  authClient?: VertexAuthClient
  defaultHeaders?: Record<string, string>
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

export function resolveMistralVertexProject(
  config: MistralVertexConfig,
): string | undefined {
  return (
    config.project ??
    readEnv('GOOGLE_CLOUD_PROJECT') ??
    readEnv('GOOGLE_VERTEX_PROJECT')
  )
}

export function resolveMistralVertexLocation(
  config: MistralVertexConfig,
): string {
  const location =
    config.location ??
    readEnv('GOOGLE_CLOUD_LOCATION') ??
    readEnv('GOOGLE_VERTEX_LOCATION')
  if (location === undefined) {
    throw new MistralVertexAuthError(
      'Mistral Vertex needs a location. Pass location on the factory, or set GOOGLE_CLOUD_LOCATION or GOOGLE_VERTEX_LOCATION. Use us-central1 or europe-west4.',
    )
  }
  return location
}

export function resolveMistralVertexModelUrl(
  model: string,
  config: MistralVertexConfig,
): string {
  const project = resolveMistralVertexProject(config)
  if (project === undefined) {
    throw new MistralVertexAuthError(
      'Mistral Vertex needs a project. Pass project on the factory, or set GOOGLE_CLOUD_PROJECT or GOOGLE_VERTEX_PROJECT.',
    )
  }
  const location = resolveMistralVertexLocation(config)
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/mistralai/models/${model}`
}

export async function resolveMistralVertexAccessToken(
  config: MistralVertexConfig,
): Promise<string> {
  if (config.getAccessToken !== undefined) {
    return config.getAccessToken()
  }

  if (config.authClient !== undefined) {
    const headers = await config.authClient.getRequestHeaders()
    const authorization = headers.get('Authorization')
    if (authorization === null || !authorization.startsWith('Bearer ')) {
      throw new MistralVertexAuthError(
        'Mistral Vertex authClient.getRequestHeaders() must return an Authorization Bearer token.',
      )
    }
    return authorization.slice('Bearer '.length)
  }

  try {
    const { GoogleAuth } = await import('google-auth-library')
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
    const client = await auth.getClient()
    const token = await client.getAccessToken()
    if (token.token === null || token.token === undefined) {
      throw new MistralVertexAuthError(
        'Mistral Vertex could not load a Google access token from Application Default Credentials.',
      )
    }
    return token.token
  } catch (error) {
    if (error instanceof MistralVertexAuthError) {
      throw error
    }
    throw new MistralVertexAuthError(
      'Mistral Vertex needs google-auth-library, or pass authClient or getAccessToken. Install google-auth-library next to @tanstack/ai-mistral.',
    )
  }
}
