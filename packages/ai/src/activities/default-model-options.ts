/**
 * Puts the adapter's `defaultModelOptions` under the call's `modelOptions`.
 *
 * The merge is one level deep. A key that the call sets replaces the default
 * key in full. When the adapter has no defaults, this returns `options` as is
 * (the same object).
 *
 * Each activity calls this once, so the engine, middleware and adapter all
 * read the same merged value.
 */
export function withDefaultModelOptions<
  T extends {
    adapter: { defaultModelOptions?: object | undefined }
    modelOptions?: object | undefined
  },
>(options: T) {
  const defaults = options.adapter.defaultModelOptions
  if (defaults === undefined) return options
  return {
    ...options,
    modelOptions: { ...defaults, ...options.modelOptions },
  }
}
