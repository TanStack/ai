/**
 * Shared OpenRouter id helpers for `convert-openrouter-models.ts` and
 * `sync-provider-models.ts`.
 *
 * OpenRouter marks unstable routing aliases with a leading `~`
 * (`~anthropic/claude-haiku-latest`). Those aliases are not stable model
 * ids and they cannot become JS identifiers, so the generators skip them.
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
  if (isRoutingAlias(modelId)) {
    throw new Error(
      `Refusing to name a routing alias ${JSON.stringify(modelId)}. Filter aliases with rejectRoutingAliases() first.`,
    )
  }

  const constName = modelId
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
