import { getByokKey } from './get-byok-key'
import { byokMissing } from './byok-missing'
import type { ProviderId } from '../shared/providers'

/**
 * Prefer a per-request BYOK header key over a server env-configured adapter.
 *
 * @example
 * ```ts
 * adapter: preferByokAdapter(request, 'openai', model, {
 *   byok: createOpenaiChat,
 *   env: openaiText,
 * })
 * ```
 */
export function preferByokAdapter<TModel extends string, TAdapter>(
  request: { headers: Pick<Headers, 'get'> },
  provider: ProviderId,
  model: TModel,
  factories: {
    byok: (model: TModel, apiKey: string) => TAdapter
    env: (model: TModel) => TAdapter
  },
): TAdapter {
  const key = getByokKey(request, provider)
  return key ? factories.byok(model, key) : factories.env(model)
}

/**
 * Return a typed `byokMissing` response when neither a BYOK header nor any of
 * the named env vars is present. Returns `null` when the request may proceed.
 */
export function requireByokOrEnv(
  request: { headers: Pick<Headers, 'get'> },
  provider: ProviderId,
  envVarNames: ReadonlyArray<string>,
): Response | null {
  const hasByokKey = Boolean(getByokKey(request, provider))
  const hasEnvKey = envVarNames.some((name) => Boolean(process.env[name]))
  if (!hasByokKey && !hasEnvKey) return byokMissing(provider)
  return null
}