export class GrokVertexAuthError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'GrokVertexAuthError'
  }
}

function isMissingGoogleAuthLibrary(error: unknown): boolean {
  if (!(error instanceof Error) || !('code' in error)) {
    return false
  }
  const code = error.code
  if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') {
    return false
  }
  return error.message.includes('google-auth-library')
}

export type VertexAuthClient = {
  getRequestHeaders: (url?: string | URL) => Promise<Headers>
}

/**
 * Public Vertex config for Grok. `project` and `location` match the Gemini
 * Vertex factories so one auth object works for both.
 *
 * Default location is `global`. Grok on Vertex uses the OpenAI-compatible
 * Responses endpoint under `/endpoints/openapi`.
 */
export type GrokVertexConfig = {
  project?: string
  location?: string
  /** Override the OpenAI-compatible Vertex base URL. Used by e2e. */
  baseURL?: string
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

export function toVertexGrokModelId(model: string): string {
  if (model.startsWith('xai/')) {
    return model
  }
  return `xai/${model}`
}

export function resolveGrokVertexProject(
  config: GrokVertexConfig,
): string | undefined {
  return (
    config.project ??
    readEnv('GOOGLE_CLOUD_PROJECT') ??
    readEnv('GOOGLE_VERTEX_PROJECT')
  )
}

export function resolveGrokVertexLocation(config: GrokVertexConfig): string {
  return (
    config.location ??
    readEnv('GOOGLE_CLOUD_LOCATION') ??
    readEnv('GOOGLE_VERTEX_LOCATION') ??
    'global'
  )
}

export function resolveGrokVertexBaseURL(config: GrokVertexConfig): string {
  if (config.baseURL !== undefined && config.baseURL.length > 0) {
    return config.baseURL.replace(/\/+$/, '')
  }

  const project = resolveGrokVertexProject(config)
  if (project === undefined) {
    throw new GrokVertexAuthError(
      'Grok Vertex needs a project, or a baseURL. Pass project on the factory, or set GOOGLE_CLOUD_PROJECT or GOOGLE_VERTEX_PROJECT.',
    )
  }

  const location = resolveGrokVertexLocation(config)
  if (location === 'global') {
    return `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/endpoints/openapi`
  }
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/openapi`
}

export async function resolveGrokVertexAccessToken(
  config: GrokVertexConfig,
): Promise<string> {
  if (config.getAccessToken !== undefined) {
    return config.getAccessToken()
  }

  if (config.authClient !== undefined) {
    const headers = await config.authClient.getRequestHeaders()
    const authorization = headers.get('Authorization')
    if (authorization === null || !authorization.startsWith('Bearer ')) {
      throw new GrokVertexAuthError(
        'Grok Vertex authClient.getRequestHeaders() must return an Authorization Bearer token.',
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
      throw new GrokVertexAuthError(
        'Grok Vertex could not load a Google access token from Application Default Credentials.',
      )
    }
    return token.token
  } catch (error) {
    if (error instanceof GrokVertexAuthError) {
      throw error
    }
    if (isMissingGoogleAuthLibrary(error)) {
      throw new GrokVertexAuthError(
        'Grok Vertex needs google-auth-library, or pass authClient or getAccessToken. Install google-auth-library next to @tanstack/ai-grok.',
      )
    }
    throw new GrokVertexAuthError(
      'Grok Vertex could not load a Google access token from Application Default Credentials.',
      { cause: error },
    )
  }
}
