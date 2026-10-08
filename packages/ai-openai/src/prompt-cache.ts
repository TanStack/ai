import type { ResolvedPromptCache } from '@tanstack/ai'

/**
 * Cut a cache key to 64 characters, the most OpenAI accepts. It counts code
 * points, so an emoji or a CJK character is never cut in half.
 */
export function clampPromptCacheKey(key: string | undefined) {
  return key === undefined ? undefined : Array.from(key).slice(0, 64).join('')
}

/**
 * The prompt cache fields of a Responses request.
 *
 * - `explicitMode`: the model takes `prompt_cache_options` in place of
 *   `prompt_cache_retention` (see `openAIModelUsesExplicitPromptCache`).
 * - `longRetention`: the endpoint keeps a cache for longer than a few minutes.
 */
export function responsesPromptCacheFields(
  promptCache: ResolvedPromptCache | undefined,
  flags: { explicitMode: boolean; longRetention: boolean },
) {
  const fields: Record<string, unknown> = {}
  if (!promptCache) return fields
  const { retention } = promptCache
  const key = clampPromptCacheKey(promptCache.key)
  const isLong = retention === 'long' && flags.longRetention
  if (retention !== 'none' && key) fields.prompt_cache_key = key
  if (!flags.explicitMode) {
    if (isLong) fields.prompt_cache_retention = '24h'
    return fields
  }
  if (retention === 'none') fields.prompt_cache_options = { mode: 'explicit' }
  else if (isLong) fields.prompt_cache_options = { ttl: '30m' }
  return fields
}

/**
 * The prompt cache fields of a Chat Completions request.
 *
 * A short retention sends the key only to `api.openai.com`, because another
 * server can reject a field it does not know. A long retention sends the key
 * and `24h` when `longRetention` is true.
 */
export function chatPromptCacheFields(
  promptCache: ResolvedPromptCache | undefined,
  flags: { baseURL: string; longRetention: boolean },
) {
  const fields: Record<string, unknown> = {}
  if (!promptCache || promptCache.retention === 'none') return fields
  const key = clampPromptCacheKey(promptCache.key)
  const isLong = promptCache.retention === 'long' && flags.longRetention
  const sendsKey = isLong || flags.baseURL.includes('api.openai.com')
  if (key && sendsKey) fields.prompt_cache_key = key
  if (isLong) fields.prompt_cache_retention = '24h'
  return fields
}
