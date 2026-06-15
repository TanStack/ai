/** Options accepted by a capability getter. */
export interface CapabilityGetOptions {
  /** When true, return undefined instead of throwing if the capability is absent. */
  optional?: boolean
}

/**
 * The minimal context shape a capability accessor needs. The full
 * `ChatMiddlewareContext` satisfies this (it has `capabilities`), so accessors
 * accept any middleware context without referencing `any`.
 */
export interface CapabilityContext {
  capabilities: CapabilityRegistry
}

/** Reads a capability value off a context. Overloaded so the flag narrows the return. */
export interface CapabilityGetter<TValue> {
  (ctx: CapabilityContext): TValue
  (ctx: CapabilityContext, opts: { optional: true }): TValue | undefined
}

/** Writes a capability value onto a context. */
export type CapabilityProvider<TValue> = (
  ctx: CapabilityContext,
  value: TValue,
) => void

/**
 * A capability handle. It is BOTH a `[get, provide]` tuple (array-destructurable)
 * AND the identity used in middleware `requires`/`provides` declarations.
 *
 * Runtime identity is this object's reference. The `capabilityName` literal is
 * used for diagnostics and COMPILE-TIME tracking only — capability names MUST be
 * unique across an app or the type-level coverage check conflates them.
 */
export type Capability<TValue = unknown, TName extends string = string> = readonly [
  get: CapabilityGetter<TValue>,
  provide: CapabilityProvider<TValue>,
] & {
  readonly capabilityName: TName
  /** @internal Presence check for the post-setup assertion. */
  has: (ctx: CapabilityContext) => boolean
}

/**
 * A capability handle with permissive value/name — for use as a constraint in
 * `requires`/`provides` arrays. Concentrates `any` in one named alias (same
 * convention as `AnyTextAdapter`/`AnyTool`); needed so `Capability<SpecificT>`
 * is assignable to the handle-array element type.
 */
export type CapabilityHandle = Capability<any, string>

/**
 * Per-request bookkeeping: which capabilities were provided, plus the
 * duplicate-provide notification. Capability VALUES live in per-capability
 * WeakMaps (see `createCapability`), not here — this only tracks presence.
 */
export class CapabilityRegistry {
  private readonly provided = new Set<CapabilityHandle>()
  private onDuplicate?: (name: string) => void

  /** Register a callback fired when a handle is provided more than once. */
  setOnDuplicate(cb: (name: string) => void): void {
    this.onDuplicate = cb
  }

  /** Record that `handle` was provided; fire the duplicate callback on repeats. */
  markProvided(handle: CapabilityHandle): void {
    if (this.provided.has(handle)) this.onDuplicate?.(handle.capabilityName)
    this.provided.add(handle)
  }

  has(handle: CapabilityHandle): boolean {
    return this.provided.has(handle)
  }
}

/**
 * Create a capability. Returns a hybrid handle that destructures to
 * `[get, provide]` and is itself the identity for `requires`/`provides`.
 *
 * Curried so the value type is supplied explicitly while the name literal is
 * INFERRED from the argument: `createCapability<T>()('name')`. (A single call
 * `createCapability<T>('name')` cannot work — supplying `T` explicitly stops
 * TypeScript inferring the name, collapsing it to `string` and defeating the
 * compile-time coverage check that keys on the literal name.)
 *
 * @example
 * ```ts
 * const persistenceCapability = createCapability<ChatPersistence>()('persistence')
 * const [getPersistence, providePersistence] = persistenceCapability
 * ```
 */
export function createCapability<TValue = unknown>(): <
  const TName extends string,
>(name: TName) => Capability<TValue, TName> {
  return <const TName extends string>(name: TName): Capability<TValue, TName> => {
    // Each capability owns a typed WeakMap keyed by the context object. Because
    // the value type is TValue, reads are typed with no assertion.
    const values = new WeakMap<CapabilityContext, TValue>()

    function get(ctx: CapabilityContext): TValue
    function get(ctx: CapabilityContext, opts: { optional: true }): TValue | undefined
    function get(
      ctx: CapabilityContext,
      opts?: CapabilityGetOptions,
    ): TValue | undefined {
      if (!values.has(ctx)) {
        if (opts?.optional) return undefined
        throw new Error(
          `Capability "${name}" was requested but never provided. Ensure a ` +
            `middleware provides it in setup(), ordered before this consumer.`,
        )
      }
      return values.get(ctx)
    }

    const provide: CapabilityProvider<TValue> = (ctx, value) => {
      values.set(ctx, value)
      ctx.capabilities.markProvided(handle)
    }

    const pair: readonly [CapabilityGetter<TValue>, CapabilityProvider<TValue>] = [
      get,
      provide,
    ]
    // Object.assign's return type is the intersection of the tuple and the
    // props, which IS Capability<TValue, TName> — no cast needed.
    const handle = Object.assign(pair, {
      capabilityName: name,
      has: (ctx: CapabilityContext) => values.has(ctx),
    })
    return handle
  }
}
