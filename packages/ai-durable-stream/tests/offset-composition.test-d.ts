/**
 * Compile-time proof that the REAL durable-stream backend composes with
 * `@tanstack/ai-sandbox`'s run driver and reaper.
 *
 * This is the integration counterpart to
 * `packages/ai-sandbox/tests/offset-generics.test-d.ts`, which asserts the same
 * threading against a locally-declared branded offset (the sandbox package must
 * not depend on a durability backend). Here the actual `durableStream` is used,
 * so the assertion covers the composition an application really writes.
 *
 * THE BUG THIS PINS. `durableStream` returns
 * `StreamDurability<DurableStreamOffset>`. `StreamDurability` is contravariant
 * in its offset (`read` takes one), so that type is NOT assignable to
 * `StreamDurability<string>`. While `SandboxRunDriverOptions.durability` and
 * `ReapOptions.durability` hardcoded the `string` default, this file's
 * assignments failed with:
 *
 * ```
 * error TS2322: Type '(runId: string) => StreamDurability<DurableStreamOffset>'
 *   is not assignable to type '(runId: string) => StreamDurability<string>'.
 *     Types of property 'read' are incompatible.
 *       Types of parameters 'offset' and 'offset' are incompatible.
 *         Type 'string' is not assignable to type 'DurableStreamOffset'.
 * ```
 *
 * i.e. the Cloudflare-backed production durability path — the one the sandbox
 * docs point people at for multi-host durability — could not be wired without a
 * cast.
 */
import { expectTypeOf } from 'vitest'
import type { ReapOptions, SandboxRunDriverOptions } from '@tanstack/ai-sandbox'
import type { StreamDurability } from '@tanstack/ai'
import type { DurableStreamOffset, durableStream } from '../src'

declare const logFor: (runId: string) => ReturnType<typeof durableStream>

// The composition itself: a `durableStream` factory is accepted by both option
// types, with no cast.
const driverDurability: SandboxRunDriverOptions<DurableStreamOffset>['durability'] =
  logFor
const reapDurability: ReapOptions<DurableStreamOffset>['durability'] = logFor
void driverDurability
void reapDurability

// And the offset type FLOWS THROUGH rather than being widened away — an
// application never writes `TOffset` explicitly, so inference is the part that
// has to work.
declare function inferDriver<TOffset extends string>(
  input: Pick<SandboxRunDriverOptions<TOffset>, 'durability'>,
): TOffset
expectTypeOf(
  inferDriver({ durability: logFor }),
).toEqualTypeOf<DurableStreamOffset>()

declare function inferReap<TOffset extends string>(
  input: Pick<ReapOptions<TOffset>, 'durability'>,
): TOffset
expectTypeOf(
  inferReap({ durability: logFor }),
).toEqualTypeOf<DurableStreamOffset>()

// The threaded parameter must NOT have degraded into `string` on the way. If it
// had, an unvalidated offset would type-check here and `resumeFrom`/`read`
// offsets would have lost the meaning the brand gives them. Asserted THROUGH
// the driver's option type, not on the adapter directly, so this also fails if
// `DurableStreamOffset` itself is ever widened to `string` — the brand is only
// worth threading while it still excludes something.
declare const durability: ReturnType<typeof durableStream>
const asFactoryOffset: StreamDurability<DurableStreamOffset> = durability
void asFactoryOffset

declare const threaded: ReturnType<
  SandboxRunDriverOptions<DurableStreamOffset>['durability']
>
// @ts-expect-error an unvalidated string is not a durable-stream cursor
threaded.read('not-a-cursor')
expectTypeOf<
  Parameters<SandboxRunDriverOptions<DurableStreamOffset>['durability']>
>().toEqualTypeOf<[runId: string]>()
