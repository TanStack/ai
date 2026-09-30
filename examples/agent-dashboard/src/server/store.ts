/**
 * Durable server state for the dashboard, in one JSON file.
 *
 * The example was all `new Map()` — every team's runs, memory, and automations
 * lived in the Nitro process and died with it. This is the smallest thing that
 * lets you close the tab, restart the server, and still find each team where you
 * left it: a single snapshot file, written through on every mutation and replayed
 * on boot. No database, no schema, no new dependency.
 *
 * Persisted: chat run state (messages, runs, interrupts, metadata) plus the
 * dashboard's own side tables (threads, pod memory, schedules, webhooks).
 * Not persisted: the in-flight injection queue and the dev offline toggle
 * (ephemeral); and inbox/credentials/generation stores — nothing here writes
 * them, and secrets do not belong in a plaintext file. Add an encrypted store
 * before persisting credentials.
 *
 * ponytail: single-process, single-file. A multi-node dashboard needs a real DB;
 * this one does not. Writes are debounced and atomic (tmp + rename); the last
 * <100ms of mutations can be lost on a hard crash — fine for a demo.
 *
 * Server-only.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { memoryPersistence } from '@tanstack/ai-persistence'
import type { ModelMessage } from '@tanstack/ai'
import type { InterruptRecord, RunRecord } from '@tanstack/ai-persistence'

interface PersistedState {
  messages: Record<string, Array<ModelMessage>>
  runs: Record<string, RunRecord>
  interrupts: Record<string, InterruptRecord>
  metadata: Record<string, Record<string, { value: unknown; revision: string }>>
  // Side tables. Typed by their owning module via `fileMap<V>`.
  threads: Record<string, unknown>
  memory: Record<string, Record<string, string>>
  schedules: Record<string, unknown>
  webhooks: Record<string, unknown>
  // The team roster (teams/channels/memberships/channelMembers). Created and
  // owned by the client's TanStack DB collections; the server just persists the
  // blob so a fresh tab or a restarted server can re-seed those collections.
  roster: RosterSnapshot
}

export interface RosterSnapshot {
  teams: Array<unknown>
  channels: Array<unknown>
  memberships: Array<unknown>
  channelMembers: Array<unknown>
}

function emptyState(): PersistedState {
  return {
    messages: {},
    runs: {},
    interrupts: {},
    metadata: {},
    threads: {},
    memory: {},
    schedules: {},
    webhooks: {},
    roster: { teams: [], channels: [], memberships: [], channelMembers: [] },
  }
}

/** The persisted team roster (empty arrays when nothing has been created). */
export function getRoster(): RosterSnapshot {
  return state.roster
}

/** Replace the whole roster snapshot. ponytail: last write wins — a two-tab
 * demo can clobber, which is fine for a single local operator. */
export function setRoster(next: RosterSnapshot): void {
  state.roster = next
  flush()
}

const FILE =
  process.env.DASHBOARD_STATE_FILE ?? join(process.cwd(), '.data', 'state.json')

function load(): PersistedState {
  try {
    return { ...emptyState(), ...JSON.parse(readFileSync(FILE, 'utf8')) }
  } catch {
    // Missing or corrupt file → start clean. A demo should never fail to boot
    // over its own scratch state.
    return emptyState()
  }
}

/** The one source of truth for the file. Mutate it, then call {@link flush}. */
export const state: PersistedState = load()

let timer: ReturnType<typeof setTimeout> | undefined
/** Schedule a debounced atomic write of the whole snapshot. */
export function flush(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = undefined
    try {
      mkdirSync(dirname(FILE), { recursive: true })
      const tmp = `${FILE}.tmp`
      writeFileSync(tmp, JSON.stringify(state))
      renameSync(tmp, FILE)
    } catch (err) {
      console.error('[dashboard] state flush failed', err)
    }
  }, 100)
  timer.unref?.()
}

/**
 * A `Map` that mirrors itself into a snapshot section on every `set`/`delete`.
 * Lets the side-table modules keep their exact `Map` API (`.values()`, `.get()`,
 * …) and every existing call site persists with no change.
 */
class FileMap<V> extends Map<string, V> {
  private readonly section: keyof PersistedState
  constructor(section: keyof PersistedState) {
    super()
    this.section = section
    // Seed via `super.set` so the constructor does not flush during load.
    for (const [key, value] of Object.entries(
      (state[section] ?? {}) as Record<string, V>,
    )) {
      super.set(key, value)
    }
  }
  private sync(): void {
    ;(state as unknown as Record<string, unknown>)[this.section] =
      Object.fromEntries(this)
    flush()
  }
  override set(key: string, value: V): this {
    super.set(key, value)
    this.sync()
    return this
  }
  override delete(key: string): boolean {
    const existed = super.delete(key)
    this.sync()
    return existed
  }
}

/** A `Map` for a side table, seeded from and written through to the snapshot. */
export function fileMap<V>(section: 'threads' | 'schedules' | 'webhooks') {
  return new FileMap<V>(section)
}

/**
 * File-backed persistence for the harness host. Keeps the in-memory reference
 * backend (so every store-contract invariant is inherited, not re-implemented),
 * replays the snapshot into it on boot, then patches the four chat state stores'
 * mutators in place to mirror each write back to disk. Reads stay untouched.
 */
export function filePersistence() {
  const base = memoryPersistence()
  const { messages, runs, interrupts, metadata } = base.stores

  replay(base)

  const mirrorRun = async (runId: string): Promise<void> => {
    const rec = await runs.get(runId)
    if (rec) state.runs[runId] = rec
    flush()
  }
  const mirrorInterrupt = async (interruptId: string): Promise<void> => {
    const rec = await interrupts.get(interruptId)
    if (rec) state.interrupts[interruptId] = rec
    flush()
  }
  const mirrorMetadata = async (
    namespace: string,
    key: string,
  ): Promise<void> => {
    // getVersioned/setIf are optional MetadataStore capabilities; the in-memory
    // backend always implements them, so the non-null assertions are safe.
    const versioned = await metadata.getVersioned!(namespace, key)
    if (versioned) (state.metadata[namespace] ??= {})[key] = versioned
    flush()
  }

  const saveThread = messages.saveThread.bind(messages)
  messages.saveThread = async (threadId, msgs) => {
    await saveThread(threadId, msgs)
    state.messages[threadId] = msgs
    flush()
  }

  const createOrResume = runs.createOrResume.bind(runs)
  runs.createOrResume = async (input) => {
    const rec = await createOrResume(input)
    state.runs[rec.runId] = rec
    flush()
    return rec
  }
  const updateRun = runs.update.bind(runs)
  runs.update = async (runId, patch) => {
    await updateRun(runId, patch)
    await mirrorRun(runId)
  }

  const createInterrupt = interrupts.create.bind(interrupts)
  interrupts.create = async (record) => {
    await createInterrupt(record)
    await mirrorInterrupt(record.interruptId)
  }
  const resolveInterrupt = interrupts.resolve.bind(interrupts)
  interrupts.resolve = async (interruptId, response) => {
    await resolveInterrupt(interruptId, response)
    await mirrorInterrupt(interruptId)
  }
  const cancelInterrupt = interrupts.cancel.bind(interrupts)
  interrupts.cancel = async (interruptId) => {
    await cancelInterrupt(interruptId)
    await mirrorInterrupt(interruptId)
  }
  const commitBatch = interrupts.commitBatch?.bind(interrupts)
  interrupts.commitBatch = async (entries) => {
    await commitBatch?.(entries)
    for (const entry of entries) await mirrorInterrupt(entry.interruptId)
  }

  const setMetadata = metadata.set.bind(metadata)
  metadata.set = async (namespace, key, value) => {
    await setMetadata(namespace, key, value)
    await mirrorMetadata(namespace, key)
  }
  const setIfMetadata = metadata.setIf!.bind(metadata)
  metadata.setIf = async (namespace, key, value, expectedRevision) => {
    const result = await setIfMetadata(namespace, key, value, expectedRevision)
    if (result.ok) await mirrorMetadata(namespace, key)
    return result
  }
  const deleteMetadata = metadata.delete.bind(metadata)
  metadata.delete = async (namespace, key) => {
    await deleteMetadata(namespace, key)
    if (state.metadata[namespace]) {
      delete state.metadata[namespace][key]
      flush()
    }
  }

  return base
}

/** Rebuild the in-memory stores from the snapshot by re-applying its writes. */
function replay(base: ReturnType<typeof memoryPersistence>): void {
  const { messages, runs, interrupts, metadata } = base.stores

  for (const [threadId, msgs] of Object.entries(state.messages)) {
    void messages.saveThread(threadId, msgs)
  }
  for (const rec of Object.values(state.runs)) {
    // createOrResume seeds the creation fields; update restores the mutable ones
    // (status, finishedAt, usage, …) exactly as stored.
    void runs.createOrResume(rec).then(() => runs.update(rec.runId, rec))
  }
  for (const rec of Object.values(state.interrupts)) {
    const { status, response } = rec
    // ponytail: a resolved/cancelled interrupt replays through resolve/cancel,
    // so its `resolvedAt` restamps to boot time. Pending interrupts — the case
    // that matters for a paused, awaiting-approval run — restore exactly.
    void interrupts.create(rec).then(() => {
      if (status === 'resolved')
        return interrupts.resolve(rec.interruptId, response)
      if (status === 'cancelled') return interrupts.cancel(rec.interruptId)
      return undefined
    })
  }
  for (const [namespace, keys] of Object.entries(state.metadata)) {
    for (const [key, entry] of Object.entries(keys)) {
      // ponytail: revision restarts at 1 on replay; optimistic-concurrency
      // revisions are not stable across a restart. No caller here depends on it.
      void metadata.set(namespace, key, entry.value)
    }
  }
}
