import type { ConverseCommandInput } from '@aws-sdk/client-bedrock-runtime'
import type { ResolvedPromptCache } from '@tanstack/ai'
import type { BedrockCachePoint } from '../message-types'

/** True when one of the blocks is a cache point. */
function hasCachePoint(
  blocks: ReadonlyArray<{ cachePoint?: unknown }> | undefined,
) {
  return blocks?.some((block) => block.cachePoint !== undefined) ?? false
}

/**
 * Add the automatic Bedrock cache points for `chat({ promptCache })` (pi's
 * rule). Only Claude models get them. When the request already has a manual
 * cache point (system, message, or tool), the caller owns caching and the
 * request does not change. Otherwise:
 * - one cache point goes at the end of `system`, when there is a system prompt.
 * - one cache point goes at the end of the last message, when its role is
 *   `user`.
 *
 * `'long'` asks for the 1-hour TTL. Bedrock has no cache key, so `key` is not
 * used. The function returns a new input and does not change the arrays of
 * `input`.
 */
export function addPromptCachePoints(
  model: string,
  input: ConverseCommandInput,
  promptCache: ResolvedPromptCache | undefined,
) {
  const retention = promptCache?.retention ?? 'none'
  const system = input.system ?? []
  const messages = input.messages ?? []
  const hasManualCachePoint =
    hasCachePoint(system) ||
    hasCachePoint(input.toolConfig?.tools) ||
    messages.some((message) => hasCachePoint(message.content))
  const isClaude = /claude/i.test(model)
  if (retention === 'none' || !isClaude || hasManualCachePoint) return input

  const cachePoint: BedrockCachePoint =
    retention === 'long' ? { type: 'default', ttl: '1h' } : { type: 'default' }
  const last = messages.at(-1)
  return {
    ...input,
    ...(system.length > 0 && { system: [...system, { cachePoint }] }),
    ...(last?.role === 'user' && {
      messages: [
        ...messages.slice(0, -1),
        { ...last, content: [...(last.content ?? []), { cachePoint }] },
      ],
    }),
  }
}
