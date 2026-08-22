import { isProviderId } from './providers'

/**
 * A BYOK provider declared by an adapter. `id` is the `x-byok-<id>` slug and
 * is required — `{ id?: string }` is not a {@link ByokProvider}.
 */
export interface ByokProvider<TId extends string = string> {
  readonly id: TId
  readonly label: string
  /**
   * Env var names the relay may read. Names only — never put `process.env`
   * values here. This object is imported on the client.
   */
  readonly env?: ReadonlyArray<string>
}

/**
 * Input for {@link defineByokProvider}. `id` cannot be optional: if `TId`
 * includes `undefined`, `id` becomes `never` and the object is unassignable.
 */
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
