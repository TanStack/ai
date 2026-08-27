import type { AnthropicVertex } from '@anthropic-ai/vertex-sdk'

export class AnthropicVertexAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnthropicVertexAuthError'
  }
}

type VertexSdkOptions = NonNullable<
  ConstructorParameters<typeof AnthropicVertex>[0]
>

export type AnthropicVertexConfig = Omit<
  VertexSdkOptions,
  'projectId' | 'region'
> & {
  project?: string
  location?: string
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value.length === 0) {
    return undefined
  }
  return value
}

function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined') {
    return undefined
  }
  if (process.env === undefined) {
    return undefined
  }
  return nonEmpty(process.env[name])
}

export function resolveAnthropicVertexOptions(
  config: AnthropicVertexConfig = {},
): VertexSdkOptions {
  const { project, location, ...rest } = config
  const projectId =
    nonEmpty(project) ??
    readEnv('GOOGLE_CLOUD_PROJECT') ??
    readEnv('GOOGLE_VERTEX_PROJECT') ??
    readEnv('ANTHROPIC_VERTEX_PROJECT_ID')
  const region =
    nonEmpty(location) ??
    readEnv('GOOGLE_CLOUD_LOCATION') ??
    readEnv('GOOGLE_VERTEX_LOCATION') ??
    readEnv('CLOUD_ML_REGION')

  if (region === undefined) {
    throw new AnthropicVertexAuthError(
      'Anthropic Vertex needs a location. Pass location on the factory, or set GOOGLE_CLOUD_LOCATION, GOOGLE_VERTEX_LOCATION, or CLOUD_ML_REGION.',
    )
  }

  return {
    ...rest,
    projectId: projectId ?? null,
    region,
  }
}
