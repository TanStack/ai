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
import { withSandbox } from '../src'
import type {
  AlignToStoredLogOptions,
  ReapOptions,
  RunDeps,
  SandboxDefinition,
  SandboxDurabilityOptions,
  SandboxMiddlewareOptions,
  SandboxRunDriverOptions,
  SandboxRunDurability,
} from '../src'
import type { PipeToRunLogOptions, RunController } from '../src/run'
import type { awaitLogQuiescence, fenceDurability } from '../src/claim'
import type { RunStore, StreamChunk, StreamDurability } from '@tanstack/ai'

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
// `withSandbox`'s durability option — the POST-handler half of the durable
// path, and the last place the offset wall stood.
//
// The driver and the reaper (above) accept a branded backend, but
// `SandboxDurabilityOptions.adapter` hardcoded `StreamDurability`, so
// `withSandbox(sandbox, { runs, durability: { adapter } })` — the route that
// STARTS a durable run — rejected the very adapter the resume route accepted:
//
//   error TS2322: Type 'StreamDurability<DurableStreamOffset>' is not
//     assignable to type 'StreamDurability<string>'.
//     Types of property 'read' are incompatible.
//       Type 'string' is not assignable to type 'DurableStreamOffset'.
//
// An application could therefore wire the recommended production backend on
// only one of the two routes it needs.
// ---------------------------------------------------------------------------

declare const definition: SandboxDefinition
declare const runs: RunStore

const brandedOption: SandboxDurabilityOptions<BrandedOffset> = {
  adapter: brandedLog,
}
const brandedMiddlewareOptions: SandboxMiddlewareOptions<BrandedOffset> = {
  runs,
  durability: { adapter: brandedLog },
}
void brandedOption
void brandedMiddlewareOptions

// Inference at the real call site: an application never writes `TOffset`, so a
// bare `withSandbox(...)` call is what has to compile.
withSandbox(definition, { runs, durability: { adapter: brandedLog } })

// …including with every other knob present, so the parameter is not silently
// pinned by a sibling property.
withSandbox(definition, {
  runs,
  durability: {
    adapter: brandedLog,
    journal: '/tmp/journal',
    detachedRunTtl: '30m',
    detachOnDisconnect: false,
    attach: true,
    pollIntervalMs: 50,
    attachWaitMs: 1_000,
  },
})

// The bus payload is NOT parameterized, and that is the deliberate half of the
// fix: `createCapability<T>()` forces one concrete instantiation, so the
// payload's log is typed as the offset-covariant view (`read` omitted) that
// every `StreamDurability<TOffset>` is assignable to. Assert both directions —
// a branded log goes IN, and nothing tries to take an offset back OUT through
// `read`.
declare const payload: SandboxRunDurability
const payloadLog: SandboxRunDurability['adapter'] = brandedLog
void payloadLog
expectTypeOf<SandboxRunDurability['adapter']>().not.toHaveProperty('read')
expectTypeOf(payload.adapter.snapshot).toBeCallableWith()

// ---------------------------------------------------------------------------
// Backward compatibility: the `= string` default is what keeps every existing
// call site compiling with no change.
// ---------------------------------------------------------------------------

declare const plainFactory: (runId: string) => StreamDurability

declare const plainLog: StreamDurability

const defaultDriver: SandboxRunDriverOptions['durability'] = plainFactory
const defaultReap: ReapOptions['durability'] = plainFactory
const defaultDeps: RunDeps['durability'] = plainFactory
const defaultOption: SandboxDurabilityOptions['adapter'] = plainLog
const defaultMiddleware: SandboxMiddlewareOptions = {
  runs,
  durability: { adapter: plainLog },
}
void defaultDriver
void defaultReap
void defaultDeps
void defaultOption
void defaultMiddleware

// A call site that names no offset at all — today's every-existing-app shape.
withSandbox(definition, { runs, durability: { adapter: plainLog } })
withSandbox(definition)

expectTypeOf<SandboxRunDriverOptions['durability']>().toEqualTypeOf<
  (runId: string) => StreamDurability<string>
>()
expectTypeOf<ReapOptions['durability']>().toEqualTypeOf<
  (runId: string) => StreamDurability<string>
>()
expectTypeOf<SandboxDurabilityOptions['adapter']>().toEqualTypeOf<
  StreamDurability<string>
>()
