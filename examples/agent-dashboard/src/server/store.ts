/**
 * Durable server state for the dashboard, in one JSON file.
 *
 * The example was all `new Map()` — every team's runs, memory, and automations
 * lived in the Nitro process and died with it. This is the smallest thing that
 * lets you close the tab, restart the server, and still find each team where you
 * left it: a single snapshot file, written through on every mutation and replayed
 * on boot. No database, no schema, no new dependency.
 *
 * Persisted: every harness store (messages, runs, interrupts, metadata, the
 * session index, the inbox, media, …) plus the dashboard's own side tables
 * (pod memory, schedules, webhooks, budgets). Not persisted: the in-flight
 * injection job list (ephemeral), and credentials:
 * secrets do not belong in a plaintext file.
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
  /** Every harness store but credentials (see `filePersistence`). */
  stores?: Record<string, Record<string, unknown>>
  // Legacy chat stores, read once by `replayLegacy`.
  messages: Record<string, Array<ModelMessage>>
  runs: Record<string, RunRecord>
  interrupts: Record<string, InterruptRecord>
  metadata: Record<string, Record<string, { value: unknown; revision: string }>>
  // Side tables. Typed by their owning module via `fileMap<V>`.
  // `threads` is legacy: the session index replaced it.
  threads: Record<string, unknown>
  memory: Record<string, Record<string, string>>
  schedules: Record<string, unknown>
  webhooks: Record<string, unknown>
  budgets: Record<string, unknown>
  relayTokens: Record<string, unknown>
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
    budgets: {},
    relayTokens: {},
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
export function fileMap<V>(
  section: 'schedules' | 'webhooks' | 'budgets' | 'relayTokens',
) {
  return new FileMap<V>(section)
}

// Secrets do not belong in a plaintext file. The other stores are mirrored.
const UNSAVED_STORES = new Set(['credentials'])

/** JSON with `Map`s and bytes, for the fields of the in-memory stores. */
function encode(value: unknown): unknown {
  if (value instanceof Map) {
    return { $map: [...value].map(([k, v]) => [k, encode(v)]) }
  }
  if (value instanceof Uint8Array) {
    return { $bytes: Buffer.from(value).toString('base64') }
  }
  if (Array.isArray(value)) return value.map(encode)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, encode(v)]),
    )
  }
  return value
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode)
  if (value && typeof value === 'object') {
    if ('$map' in value && Array.isArray(value.$map)) {
      return new Map(
        value.$map.map(([k, v]: [string, unknown]) => [k, decode(v)]),
      )
    }
    if ('$bytes' in value && typeof value.$bytes === 'string') {
      return new Uint8Array(Buffer.from(value.$bytes, 'base64'))
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, decode(v)]),
    )
  }
  return value
}

/** The `Map` and counter fields of a store: its whole state. */
function fieldsOf(store: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(store).filter(
      ([, v]) => v instanceof Map || typeof v === 'number',
    ),
  )
}

const READ = /^(get|list|load|read|has|find|count|stream)/

/**
 * File-backed persistence for the harness host. It keeps the in-memory
 * reference backend, so every store contract holds. On boot it fills each
 * store's fields from the snapshot. After each write call it saves them back.
 *
 * ponytail: it reads the fields of the reference stores, so it depends on
 * their shape (`Map` fields). A real app uses a database adapter instead.
 */
export function filePersistence() {
  const base = memoryPersistence()
  const stores = Object.entries(base.stores).filter(
    ([name]) => !UNSAVED_STORES.has(name),
  ) as Array<[string, Record<string, unknown>]>

  if (state.stores) {
    for (const [name, store] of stores) {
      for (const [field, saved] of Object.entries(state.stores[name] ?? {})) {
        store[field] = decode(saved)
      }
    }
  } else {
    replayLegacy(base)
  }

  let saving: ReturnType<typeof setTimeout> | undefined
  const save = () => {
    saving ??= setTimeout(() => {
      saving = undefined
      state.stores = Object.fromEntries(
        stores.map(([name, store]) => [name, encode(fieldsOf(store))]),
      ) as PersistedState['stores']
      Object.assign(state, { messages: {}, runs: {}, interrupts: {} })
      Object.assign(state, { metadata: {}, threads: {} })
      flush()
    }, 50)
    saving.unref?.()
  }
  for (const [, store] of stores) {
    const proto = Object.getPrototypeOf(store)
    for (const method of Object.getOwnPropertyNames(proto)) {
      const original = store[method]
      if (method === 'constructor' || READ.test(method)) continue
      if (typeof original !== 'function') continue
      store[method] = (...args: Array<unknown>): unknown => {
        const result = original.apply(store, args)
        if (result instanceof Promise) void result.then(save, () => {})
        else save()
        return result
      }
    }
  }
  return base
}

/**
 * Load a snapshot from before the full mirror: the chat stores and the old
 * `threads` table, which the session index replaces.
 */
function replayLegacy(base: ReturnType<typeof memoryPersistence>): void {
  const { messages, runs, interrupts, metadata, sessions } = base.stores

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
  for (const [threadId, thread] of Object.entries(state.threads)) {
    const { harness, createdAt, lastActivity } = thread as {
      harness: string
      createdAt: number
      lastActivity: number
    }
    void sessions.upsert({
      threadId,
      harness,
      createdAt,
      updatedAt: lastActivity,
      principal: { id: 'local' },
    })
  }
}
