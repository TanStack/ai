import type { FieldProjection, TruncateStrategy } from './tool-definition'

/**
 * Combinators that build a {@link FieldProjection}. This is the only public way
 * to express one — the type is branded, so a bare object literal does not
 * type-check. Use them on a tool's `context`, or inside an `optimize()` config
 * from `@tanstack/ai-optimize`.
 *
 * `@tanstack/ai` core only constructs the value; nothing in core reads it. All
 * projection behavior lives in `@tanstack/ai-optimize`.
 *
 * @example
 * ```ts
 * // "above 1500 tokens, keep a 750-token head+tail preview"
 * aboveTokens(1500, truncateHeadTail({ maxTokens: 750 }))
 *
 * // simplest form (default threshold)
 * truncateHeadTail({ maxTokens: 750 })
 * dropWithRef()
 * ```
 *
 * @public
 */

/** Options shared by the truncating strategies. */
export interface StrategyOptions {
  /** Kept-preview target size in estimated tokens. Default 750. */
  maxTokens?: number
  /** Keep a retrievable stash ref in the marker. Default true. */
  retrievable?: boolean
}

function make(
  strategy: TruncateStrategy,
  opts: { maxTokens?: number; retrievable?: boolean } = {},
): FieldProjection {
  const projection = {
    strategy,
    ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
    ...(opts.retrievable !== undefined
      ? { retrievable: opts.retrievable }
      : {}),
  }
  // The brand is a type-only marker with no runtime value, so assert it here.
  // Every projection is built through a combinator, never a bare object.
  return projection as FieldProjection
}

/** Keep the first `maxTokens` of the field, elide the rest. @public */
export function truncateHead(opts?: StrategyOptions): FieldProjection {
  return make('head', opts)
}

/** Keep the last `maxTokens` of the field, elide the rest. @public */
export function truncateTail(opts?: StrategyOptions): FieldProjection {
  return make('tail', opts)
}

/** Keep 60% from the front and 40% from the end, elide the middle. @public */
export function truncateHeadTail(opts?: StrategyOptions): FieldProjection {
  return make('head_tail', opts)
}

/** Drop the field entirely, leaving a one-line marker with a retrieval ref.
 *  @public */
export function dropWithRef(opts?: { retrievable?: boolean }): FieldProjection {
  return make('drop_with_ref', opts)
}

/**
 * Gate a projection on size: only apply it when the field is over `threshold`
 * estimated tokens. Wraps any strategy. Without it, the default threshold
 * (1500) applies.
 *
 * @public
 */
export function aboveTokens(
  threshold: number,
  projection: FieldProjection,
): FieldProjection {
  return { ...projection, aboveTokens: threshold } as FieldProjection
}
