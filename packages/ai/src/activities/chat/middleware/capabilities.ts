/** Options accepted by a capability getter. */
export interface CapabilityGetOptions {
  /** When true, return undefined instead of throwing if the capability is absent. */
  optional?: boolean
}

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

export type Capability<
  TValue = unknown,
  TName extends string = string,
> = readonly [
  get: CapabilityGetter<TValue>,
  provide: CapabilityProvider<TValue>,
] & {
  readonly capabilityName: TName
  /** @internal Presence check for the post-setup assertion. */
  has: (ctx: CapabilityContext) => boolean
}

export type CapabilityHandle = Capability<any, string>

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

export function createCapability<TValue = unknown>(): <
  const TName extends string,
>(
  name: TName,
) => Capability<TValue, TName> {
  return <const TName extends string>(
    name: TName,
  ): Capability<TValue, TName> => {
    // Each capability owns a typed WeakMap keyed by the context object. Because
    // the value type is TValue, reads are typed with no assertion.
    const values = new WeakMap<CapabilityContext, TValue>()

    function get(ctx: CapabilityContext): TValue
    function get(
      ctx: CapabilityContext,
      opts: { optional: true },
    ): TValue | undefined
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

    const pair: readonly [
      CapabilityGetter<TValue>,
      CapabilityProvider<TValue>,
    ] = [get, provide]
    // Object.assign's return type is the intersection of the tuple and the
    // props, which IS Capability<TValue, TName> — no cast needed.
    const handle = Object.assign(pair, {
      capabilityName: name,
      has: (ctx: CapabilityContext) => values.has(ctx),
    })
    return handle
  }
}
