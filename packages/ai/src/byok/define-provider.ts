import { isProviderId } from './providers'
import type { ProviderId } from './providers'

export interface ProviderValidateConfig {
  url: string
  headers: (key: string) => Record<string, string>
}

/**
 * A BYOK provider declared by an adapter. `id` is the `x-byok-<id>` slug and
 * is required — `{ id?: string }` is not a {@link ByokProvider}.
 */
export interface ByokProvider<TId extends string = string> {
  readonly id: TId
  readonly label: string
  readonly validate?: ProviderValidateConfig
}

/**
 * Input for {@link defineByokProvider}. `id` cannot be optional: if `TId`
 * includes `undefined`, `id` becomes `never` and the object is unassignable.
 */
export type ByokProviderInit<TId extends string> = {
  readonly id: undefined extends TId ? never : TId
  readonly label: string
  readonly validate?: ProviderValidateConfig
}

export function defineByokProvider<const TId extends string>(
  provider: ByokProviderInit<TId>,
): ByokProvider<TId> {
  if (!isProviderId(provider.id)) {
    throw new Error(`Invalid BYOK provider id: ${String(provider.id)}`)
  }
  const id = provider.id
  return provider.validate
    ? { id, label: provider.label, validate: provider.validate }
    : { id, label: provider.label }
}

export function byokValidateMap(
  providers: ReadonlyArray<ByokProvider>,
): Record<ProviderId, ProviderValidateConfig> {
  const next: Record<ProviderId, ProviderValidateConfig> = {}
  for (const provider of providers) {
    if (provider.validate) next[provider.id] = provider.validate
  }
  return next
}
