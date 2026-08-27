export class MistralVertexAuthError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MistralVertexAuthError'
  }
}

const MISTRAL_VERTEX_LOCATIONS = ['us-central1', 'europe-west4'] as const

function isMistralVertexLocation(
  location: string,
): location is (typeof MISTRAL_VERTEX_LOCATIONS)[number] {
  return (MISTRAL_VERTEX_LOCATIONS as ReadonlyArray<string>).includes(location)
}

function isMissingGoogleAuthLibrary(error: unknown): boolean {
  if (error instanceof Error && 'code' in error) {
    const code = error.code
    const isModuleNotFound =
      code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND'
    if (isModuleNotFound) {
      return error.message.includes('google-auth-library')
    }
    return false
  }
  return false
}

export type VertexAuthClient = {
  getRequestHeaders: (url?: string | URL) => Promise<Headers>
}

export type MistralVertexConfig = {
  project?: string
  location?: string
  resolveRequestUrl?: (stream: boolean) => string
  getAccessToken?: () => Promise<string>
  authClient?: VertexAuthClient
  defaultHeaders?: Record<string, string>
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value !== undefined && value.length > 0) {
    return value
  }
  return undefined
}

function readEnv(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env !== undefined) {
    return nonEmpty(process.env[name])
  }
  return undefined
}

export function resolveMistralVertexProject(
  config: MistralVertexConfig,
): string | undefined {
  return (
    nonEmpty(config.project) ??
    readEnv('GOOGLE_CLOUD_PROJECT') ??
    readEnv('GOOGLE_VERTEX_PROJECT')
  )
}

export function resolveMistralVertexLocation(
  config: MistralVertexConfig,
): string {
  const location =
    nonEmpty(config.location) ??
    readEnv('GOOGLE_CLOUD_LOCATION') ??
    readEnv('GOOGLE_VERTEX_LOCATION')
  if (location === undefined) {
    throw new MistralVertexAuthError(
      'Mistral Vertex needs a location. Pass location on the factory, or set GOOGLE_CLOUD_LOCATION or GOOGLE_VERTEX_LOCATION. Use us-central1 or europe-west4.',
    )
  }
  if (!isMistralVertexLocation(location)) {
    throw new MistralVertexAuthError(
      'Mistral Vertex location must be us-central1 or europe-west4. There is no global endpoint.',
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
    if (authorization !== null && authorization.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length)
    }
    throw new MistralVertexAuthError(
      'Mistral Vertex authClient.getRequestHeaders() must return an Authorization Bearer token.',
    )
  }

  try {
    const { GoogleAuth } = await import('google-auth-library')
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
    const client = await auth.getClient()
    const token = await client.getAccessToken()
    if (token.token !== null && token.token !== undefined) {
      return token.token
    }
    throw new MistralVertexAuthError(
      'Mistral Vertex could not load a Google access token from Application Default Credentials.',
    )
  } catch (error) {
    if (error instanceof MistralVertexAuthError) {
      throw error
    }
    if (isMissingGoogleAuthLibrary(error)) {
      throw new MistralVertexAuthError(
        'Mistral Vertex needs google-auth-library, or pass authClient or getAccessToken. Install google-auth-library next to @tanstack/ai-mistral.',
      )
    }
    throw new MistralVertexAuthError(
      'Mistral Vertex could not load a Google access token from Application Default Credentials.',
      { cause: error },
    )
  }
}
