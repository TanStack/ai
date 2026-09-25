import { expectTypeOf } from 'vitest'
import type {
  StreamChunk,
  StreamDurability,
  UpsertableStreamDurability,
} from '@tanstack/ai'
import type { DurableStreamOffset, durableStream } from '../src'

declare const durability: ReturnType<typeof durableStream>
declare const offset: DurableStreamOffset

expectTypeOf(
  durability.resumeFrom(),
).toEqualTypeOf<DurableStreamOffset | null>()
durability.read(offset)
durability.read('-1')
durability.read('now')

// @ts-expect-error arbitrary strings are not validated adapter cursors
durability.read('unvalidated-offset')

// durableStream's offsets are backend-assigned, so it returns a plain
// StreamDurability and must be assignable to it.
const asStreamDurability: StreamDurability<DurableStreamOffset> = durability
void asStreamDurability

// snapshot is a REQUIRED member of StreamDurability, so the adapter must expose
// it and it must speak the adapter's own branded offset.
expectTypeOf(durability.snapshot).toEqualTypeOf<
  () => Promise<Array<{ offset: DurableStreamOffset; chunk: StreamChunk }>>
>()
// It takes no arguments: a snapshot is unconditional and never tails, so there
// is nothing to abort and no offset to start from.
expectTypeOf(durability.snapshot).parameters.toEqualTypeOf<[]>()

// Being required is the whole point — an otherwise complete implementation that
// omits it must not type-check. If this ever starts compiling, snapshot has been
// silently made optional.
// @ts-expect-error snapshot is required on StreamDurability
const missingSnapshot: StreamDurability<DurableStreamOffset> = {
  resumeFrom: durability.resumeFrom,
  append: durability.append,
  read: durability.read,
  close: durability.close,
}
void missingSnapshot

// It must NOT be assignable to UpsertableStreamDurability: a caller cannot
// choose durableStream's offsets, so there is no upsert to expose. If this
// ever starts compiling, the capability distinction has been silently lost.
// @ts-expect-error durableStream does not implement upsert (offsets are backend-assigned)
const asUpsertable: UpsertableStreamDurability<DurableStreamOffset> = durability
void asUpsertable
