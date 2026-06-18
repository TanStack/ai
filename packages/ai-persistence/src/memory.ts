/**
 * In-memory {@link ChatPersistence} — the reference implementation of every
 * store. Correct within a single process (no durability across restarts); used
 * by tests, examples, and the devtools demo. Durable backends live in the
 * `@tanstack/ai-persistence-*` packages.
 */
import { InMemoryLockStore } from '@tanstack/ai'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type {
  ApprovalRecord,
  ApprovalStore,
  ArtifactRecord,
  ArtifactStore,
  ChatPersistence,
  EventLog,
  MessageStore,
  PersistedEvent,
  PersistenceMode,
  RunRecord,
  RunStore,
} from './types'

class MemoryMessageStore implements MessageStore {
  private readonly threads = new Map<string, Array<ModelMessage>>()
  loadThread(threadId: string): Promise<Array<ModelMessage>> {
    return Promise.resolve(this.threads.get(threadId)?.slice() ?? [])
  }
  saveThread(threadId: string, messages: Array<ModelMessage>): Promise<void> {
    this.threads.set(threadId, messages.slice())
    return Promise.resolve()
  }
}

class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunRecord>()
  createOrResume(input: {
    runId: string
    threadId: string
    status?: RunRecord['status']
    startedAt: number
  }): Promise<RunRecord> {
    const existing = this.runs.get(input.runId)
    if (existing) return Promise.resolve(existing)
    const record: RunRecord = {
      runId: input.runId,
      threadId: input.threadId,
      status: input.status ?? 'running',
      startedAt: input.startedAt,
    }
    this.runs.set(record.runId, record)
    return Promise.resolve(record)
  }
  update(
    runId: string,
    patch: Partial<
      Pick<RunRecord, 'status' | 'finishedAt' | 'error' | 'usage'>
    >,
  ): Promise<void> {
    const existing = this.runs.get(runId)
    if (existing) this.runs.set(runId, { ...existing, ...patch })
    return Promise.resolve()
  }
  get(runId: string): Promise<RunRecord | null> {
    return Promise.resolve(this.runs.get(runId) ?? null)
  }
}

class MemoryEventLog implements EventLog {
  private readonly logs = new Map<string, Array<PersistedEvent>>()
  append(runId: string, seq: number, event: StreamChunk): Promise<void> {
    const log = this.logs.get(runId)
    if (log) log.push({ seq, event })
    else this.logs.set(runId, [{ seq, event }])
    return Promise.resolve()
  }
  read(
    runId: string,
    opts?: { afterSeq?: number },
  ): AsyncIterable<PersistedEvent> {
    const after = opts?.afterSeq ?? -Infinity
    const events = (this.logs.get(runId) ?? []).filter((e) => e.seq > after)
    return (async function* () {
      for (const e of events) yield e
    })()
  }
  hasRun(runId: string): Promise<boolean> {
    return Promise.resolve((this.logs.get(runId)?.length ?? 0) > 0)
  }
  latestSeq(runId: string): Promise<number> {
    const log = this.logs.get(runId)
    const last = log && log.length ? log[log.length - 1] : undefined
    return Promise.resolve(last ? last.seq : 0)
  }
}

class MemoryApprovalStore implements ApprovalStore {
  private readonly approvals = new Map<string, ApprovalRecord>()
  create(record: Omit<ApprovalRecord, 'resolvedAt'>): Promise<void> {
    this.approvals.set(record.approvalId, { ...record })
    return Promise.resolve()
  }
  resolve(approvalId: string, granted: boolean): Promise<void> {
    const existing = this.approvals.get(approvalId)
    if (existing) {
      existing.status = granted ? 'granted' : 'denied'
      existing.resolvedAt = Date.now()
    }
    return Promise.resolve()
  }
  get(approvalId: string): Promise<ApprovalRecord | null> {
    return Promise.resolve(this.approvals.get(approvalId) ?? null)
  }
  decisionsForThread(threadId: string): Promise<Map<string, boolean>> {
    const decisions = new Map<string, boolean>()
    for (const a of this.approvals.values()) {
      if (a.threadId === threadId && a.status !== 'pending') {
        decisions.set(a.approvalId, a.status === 'granted')
      }
    }
    return Promise.resolve(decisions)
  }
}

class MemoryArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, ArtifactRecord>()
  save(record: ArtifactRecord): Promise<void> {
    this.artifacts.set(record.artifactId, { ...record })
    return Promise.resolve()
  }
  get(artifactId: string): Promise<ArtifactRecord | null> {
    return Promise.resolve(this.artifacts.get(artifactId) ?? null)
  }
  list(runId: string): Promise<Array<ArtifactRecord>> {
    return Promise.resolve(
      [...this.artifacts.values()].filter((a) => a.runId === runId),
    )
  }
}

/**
 * Build an in-memory persistence aggregate. All stores are always present (the
 * `mode` only declares intended coverage); durability is per-process only.
 */
export function memoryPersistence(opts?: {
  mode?: PersistenceMode
}): ChatPersistence {
  return {
    mode: opts?.mode ?? 'agent',
    messages: new MemoryMessageStore(),
    runs: new MemoryRunStore(),
    events: new MemoryEventLog(),
    approvals: new MemoryApprovalStore(),
    artifacts: new MemoryArtifactStore(),
    locks: new InMemoryLockStore(),
  }
}
