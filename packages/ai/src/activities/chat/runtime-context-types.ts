import type { ChatMiddleware } from './middleware/types'

/**
 * Shared type-level helpers for inferring the runtime `context` requirement
 * from typed tools and middleware.
 *
 * These primitives are consumed by both the chat activity options
 * (`./index.ts`, which merges tool + middleware requirements) and the tool
 * execution layer (`./tools/tool-calls.ts`, which only sees tools). They live
 * here so the two call sites share one definition instead of maintaining
 * divergent copies.
 */

/** True only when `T` is exactly `unknown`. */
type IsUnknown<T> = unknown extends T
  ? [T] extends [unknown]
    ? true
    : false
  : false

/**
 * Drops an `unknown` context requirement to `never` so that untyped tools and
 * middleware (which default `TContext` to `unknown`) contribute no requirement
 * to the merged context.
 */
type KnownContext<T> = IsUnknown<T> extends true ? never : T

/**
 * Merge two inferred context requirements, treating `never` as "no
 * requirement". Using this instead of a raw intersection keeps a `never`
 * (untyped) contributor from collapsing the whole merge to `never`.
 */
export type MergeContext<TLeft, TRight> = [TLeft] extends [never]
  ? TRight
  : [TRight] extends [never]
    ? TLeft
    : TLeft & TRight

/** Collapse a union of context requirements into their intersection. */
export type UnionToIntersection<T> = [T] extends [never]
  ? never
  : (T extends unknown ? (value: T) => void : never) extends (
        value: infer TIntersection,
      ) => void
    ? TIntersection
    : never

/** Strip `undefined` from a context requirement. */
export type DefinedContext<T> = Exclude<T, undefined>

/**
 * Extract the `context` requirement declared by a tool execute function's
 * second argument, dropping `unknown` (untyped) contexts to `never`.
 */
type ContextFromExecute<T> = T extends (...args: any) => any
  ? NonNullable<Parameters<T>[1]> extends { context: infer TUserContext }
    ? KnownContext<TUserContext>
    : never
  : never

/** Extract the context requirement declared by a single tool. */
export type ContextFromTool<T> = T extends { execute?: infer TExecute }
  ? ContextFromExecute<TExecute>
  : never

/** Extract the context requirement declared by a single middleware. */
export type ContextFromMiddleware<T> =
  T extends ChatMiddleware<infer TContext> ? KnownContext<TContext> : never
