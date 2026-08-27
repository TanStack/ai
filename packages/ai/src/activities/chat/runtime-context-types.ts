import type { ChatMiddleware } from './middleware/types'

/** True only when `T` is exactly `unknown`. */
type IsUnknown<T> = unknown extends T
  ? [T] extends [unknown]
    ? true
    : false
  : false

type KnownContext<T> = IsUnknown<T> extends true ? never : T

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
