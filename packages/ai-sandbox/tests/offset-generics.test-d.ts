/**
 * Compile-time regression for the offset type threading through the run driver,
 * the reaper, and everything they wrap.
 *
 * WHY A TYPE-LEVEL TEST AND NOT A RUNTIME ONE. The defect was purely a
 * signature: `SandboxRunDriverOptions.durability` and `ReapOptions.durability`
 * hardcoded `StreamDurability` (i.e. `StreamDurability<string>`), and
 * `StreamDurability<TOffset>` is CONTRAVARIANT in `TOffset` through `read`
 * (and through `upsert` on the upsertable variant). A backend that brands its
 * cursors — `@tanstack/ai-durable-stream`'s `durableStream`, which returns
 * `StreamDurability<DurableStreamOffset>` where
 * `DurableStreamOffset = DurableStreamCursor | '-1' | 'now'` — was therefore
 * NOT assignable, and the production multi-host durability backend could not be
 * handed to `sandboxRunDriver` or `reapDetachedRuns` without a cast. Casts of
 * that shape (`as unknown as`) are a lint ERROR under `src/**` in this repo, so
 * an application hit a hard wall, and the reaping/takeover docs had to fall
 * back to `memoryStream` in every snippet. Nothing observable at runtime
 * differed, so only the compiler can catch a regression.
 *
 * `BrandedOffset` below mirrors `DurableStreamOffset`'s SHAPE rather than
 * importing it: `@tanstack/ai-sandbox` must not depend on a durability backend
 * (the layering runs the other way), and the union-with-literal-sentinels shape
 * is what makes the assignment fail. The real composition is asserted against
 * the actual `durableStream` in
 * `packages/ai-durable-stream/tests/offset-composition.test-d.ts`.
 */
import { expectTypeOf } from 'vitest'
import type {
  AlignToStoredLogOptions,
  ReapOptions,
  RunDeps,
  SandboxRunDriverOptions,
} from '../src'
import type { PipeToRunLogOptions, RunController } from '../src/run'
import type { awaitLogQuiescence, fenceDurability } from '../src/claim'
import type { StreamChunk, StreamDurability } from '@tanstack/ai'

/** Same shape as `DurableStreamOffset`: a branded cursor plus two sentinels. */
type BrandedOffset = `branded:${string}` | '-1' | 'now'

declare const brandedFactory: (runId: string) => StreamDurability<BrandedOffset>
declare const brandedLog: StreamDurability<BrandedOffset>

// ---------------------------------------------------------------------------
// The defect, at the two option types the report named.
// ---------------------------------------------------------------------------

const driverDurability: SandboxRunDriverOptions<BrandedOffset>['durability'] =
  brandedFactory
const reapDurability: ReapOptions<BrandedOffset>['durability'] = brandedFactory
void driverDurability
void reapDurability

// Inference, not just explicit instantiation: a caller writes
// `sandboxRunDriver({ durability: logFor, … })` and never names `TOffset`, so
// the whole fix is worthless if the parameter cannot be inferred from the
// factory that is passed.
declare function inferDriver<TOffset extends string>(
  input: Pick<SandboxRunDriverOptions<TOffset>, 'durability'>,
): TOffset
expectTypeOf(
  inferDriver({ durability: brandedFactory }),
).toEqualTypeOf<BrandedOffset>()

declare function inferReap<TOffset extends string>(
  input: Pick<ReapOptions<TOffset>, 'durability'>,
): TOffset
expectTypeOf(
  inferReap({ durability: brandedFactory }),
).toEqualTypeOf<BrandedOffset>()

// ---------------------------------------------------------------------------
// The chain underneath, so nothing collapses the offset back to `string`
// one layer in.
// ---------------------------------------------------------------------------

const deps: RunDeps<BrandedOffset>['durability'] = brandedFactory
const pipeDeps: PipeToRunLogOptions<BrandedOffset>['durability'] =
  brandedFactory
const alignLog: AlignToStoredLogOptions<BrandedOffset>['durability'] =
  brandedLog
void deps
void pipeDeps
void alignLog

// `fenceDurability` sits BETWEEN a caller's log and `pipeToRunLog`. If it
// returned `StreamDurability<string>` the wall would simply move here.
expectTypeOf<ReturnType<typeof fenceDurability<BrandedOffset>>>().toEqualTypeOf<
  StreamDurability<BrandedOffset>
>()
expectTypeOf<
  Parameters<typeof awaitLogQuiescence<BrandedOffset>>[0]
>().toEqualTypeOf<StreamDurability<BrandedOffset>>()

// `RunController.attach` hands an offset back IN, so it is contravariant too.
expectTypeOf<
  Parameters<RunController<BrandedOffset>['attach']>[1]
>().toEqualTypeOf<BrandedOffset>()
expectTypeOf<
  ReturnType<RunController<BrandedOffset>['attach']>
>().toEqualTypeOf<
  AsyncIterable<{ offset: BrandedOffset; chunk: StreamChunk }>
>()

// A branded log must not silently accept an arbitrary string as an offset —
// that would mean the parameter had been widened to `string` rather than
// threaded, which is the fix this test exists to rule out.
declare const branded: StreamDurability<BrandedOffset>
// @ts-expect-error an unvalidated string is not a branded cursor
branded.read('not-a-cursor')

// ---------------------------------------------------------------------------
// Backward compatibility: the `= string` default is what keeps every existing
// call site compiling with no change.
// ---------------------------------------------------------------------------

declare const plainFactory: (runId: string) => StreamDurability

const defaultDriver: SandboxRunDriverOptions['durability'] = plainFactory
const defaultReap: ReapOptions['durability'] = plainFactory
const defaultDeps: RunDeps['durability'] = plainFactory
void defaultDriver
void defaultReap
void defaultDeps

expectTypeOf<SandboxRunDriverOptions['durability']>().toEqualTypeOf<
  (runId: string) => StreamDurability<string>
>()
expectTypeOf<ReapOptions['durability']>().toEqualTypeOf<
  (runId: string) => StreamDurability<string>
>()
