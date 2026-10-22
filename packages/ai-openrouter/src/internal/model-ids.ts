/**
 * The ids a call routes to: `model` with any `modelOptions.variant` suffix,
 * then each `modelOptions.models` fallback.
 */
export function openRouterRoutedModels(
  model: string,
  modelOptions: unknown,
): Array<string> {
  const record = (modelOptions ?? {}) as { variant?: unknown; models?: unknown }
  const primary =
    typeof record.variant === 'string' && record.variant
      ? `${model}:${record.variant}`
      : model
  const fallbacks = Array.isArray(record.models)
    ? record.models.filter((id): id is string => typeof id === 'string')
    : []
  return [primary, ...fallbacks]
}

/**
 * The catalog lists some `:variant` ids (for example `:free`) as their own
 * models. Check the full id first, then the id without its `:variant`.
 */
export function openRouterModelIn(
  set: ReadonlySet<string>,
  id: string,
): boolean {
  if (set.has(id)) return true
  const variantIndex = id.indexOf(':')
  return variantIndex !== -1 && set.has(id.slice(0, variantIndex))
}
