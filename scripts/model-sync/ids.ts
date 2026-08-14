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
