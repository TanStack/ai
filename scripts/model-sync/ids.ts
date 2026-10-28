/**
 * Shared OpenRouter id helpers for `convert-openrouter-models.ts` and
 * `sync-provider-models.ts`.
 *
 * OpenRouter marks routing aliases with a leading `~`
 * (`~anthropic/claude-haiku-latest`). The OpenRouter catalog keeps those
 * ids so `chat({ model: '~anthropic/claude-haiku-latest' })` type-checks.
 * Native provider sync skips them. The `~` is mapped to `_` only in the
 * generated constant name so the file is valid JS.
 */

const CONST_NAME_RE = /^[A-Z_][A-Z0-9_]*$/

export function isRoutingAlias(modelId: string): boolean {
  return modelId.startsWith('~')
}

export function rejectRoutingAliases<T extends { id: string }>(
  models: Array<T>,
): Array<T> {
  return models.filter((model) => !isRoutingAlias(model.id))
}

/**
 * Native adapters only accept the provider's own ids. OpenRouter uses dots
 * in Claude version suffixes (`claude-haiku-4.5`, `claude-fable-5.1`);
 * Anthropic's Messages API uses dashes (`claude-haiku-4-5`,
 * `claude-fable-5-1`). Other providers keep the OpenRouter stripped id.
 */
export function toNativeProviderId(
  strippedId: string,
  provider: 'openai' | 'anthropic' | 'gemini' | 'grok',
): string {
  if (provider === 'anthropic') {
    return strippedId.replaceAll('.', '-')
  }
  return strippedId
}

export function toModelConstName(modelId: string): string {
  const constName = modelId
    .replaceAll('~', '_')
    .replaceAll('/', '_')
    .replaceAll('-', '_')
    .replaceAll('.', '_')
    .replaceAll(':', '_')
    .toUpperCase()

  if (!CONST_NAME_RE.test(constName)) {
    throw new Error(
      `Generated constant name is not a valid JS identifier: ${JSON.stringify(
        constName,
      )} (from model id ${JSON.stringify(modelId)}).`,
    )
  }

  return constName
}
