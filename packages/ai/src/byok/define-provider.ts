import { isProviderId } from './providers'

export interface ByokProvider<TId extends string = string> {
  readonly id: TId
  readonly label: string
  readonly env?: ReadonlyArray<string>
}

export type ByokProviderInit<TId extends string> = {
  readonly id: undefined extends TId ? never : TId
  readonly label: string
  readonly env?: string | ReadonlyArray<string>
}

function normalizeEnv(
  env: string | ReadonlyArray<string> | undefined,
): ReadonlyArray<string> | undefined {
  if (env === undefined) return undefined
  return typeof env === 'string' ? [env] : env
}

export function defineByokProvider<const TId extends string>(
  provider: ByokProviderInit<TId>,
): ByokProvider<TId> {
  if (!isProviderId(provider.id)) {
    throw new Error(`Invalid BYOK provider id: ${String(provider.id)}`)
  }
  const env = normalizeEnv(provider.env)
  return {
    id: provider.id,
    label: provider.label,
    ...(env ? { env } : {}),
  }
}
