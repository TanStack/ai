/**
 * Injection: run a public tool out-of-band on the embedded host — no model turn,
 * zero tokens. One code path (`runInjection`) behind three triggers (timer,
 * manual, webhook). The tool's result is published into the session feed by the
 * harness `{ op: 'tool' }` op, so it reaches the channel view via the live tail
 * and is persisted for replay/history like any other run.
 *
 * Offline hosts: the example embeds the host, so there is no real offline host.
 * We simulate one with a dashboard-side pending queue + a dev toggle, per the
 * plan — the relay (`packages/ai-dashboard`) and its private queue are untouched.
 *
 * Server-only. This module also owns the schedule/webhook registries because the
 * dashboard owns the clock (the server ticks; see scheduler.ts).
 */
import { applyInput } from '@tanstack/ai-harness'
import { getHarnessForThread, getHost } from './harness'
import { memoryPreamble } from './memory'
import { fileMap } from './store'

export type Trigger = 'timer' | 'manual' | 'webhook'

/**
 * A job either runs one tool out-of-band (`mode: 'tool'`, the Phase 2 default) or
 * triggers a model run (`mode: 'prompt'`) whose pod memory is attached as a
 * `systemPreamble`. The PR-watcher webhook uses prompt mode so the scripted model
 * runs its full chain (check_pr → channel_create → message_post).
 */
export interface Job {
  id: string
  threadId: string
  channelId?: string
  mode: 'tool' | 'prompt'
  tool: string
  args: unknown
  /** For `mode: 'prompt'`: the message that starts the run. */
  message?: string
  trigger: Trigger
  status: 'queued' | 'accepted' | 'rejected'
  reason?: string
  /** For `mode: 'prompt'`: how many memory entries were attached. */
  attached?: number
  createdAt: number
}

export interface Schedule {
  id: string
  threadId: string
  channelId: string
  tool: string
  args: unknown
  /** 5-field cron (minute granularity), or… */
  cron?: string
  /** …a fast fixed interval, for demos and tests. */
  everySeconds?: number
  enabled: boolean
  nextFire?: number
}

export interface Webhook {
  id: string
  token: string
  threadId: string
  channelId: string
  mode: 'tool' | 'prompt'
  /** For `mode: 'tool'`: the tool to run. */
  tool: string
  /** Maps a tool arg name → a dot path into the webhook payload. */
  argMapping: Record<string, string>
  /** For `mode: 'prompt'`: the message template (payload is appended as JSON). */
  message?: string
}

const jobs: Array<Job> = []
const pending: Array<Job> = []
const seen = new Set<string>()
let offline = false

// Durable: written through to the state file on every set/delete (see store.ts).
// A schedule that came due while the server was down fires once on next boot.
export const schedules = fileMap<Schedule>('schedules')
export const webhooks = fileMap<Webhook>('webhooks')

let seq = 0
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`
}

export function isOffline(): boolean {
  return offline
}
export function setOffline(value: boolean): void {
  offline = value
  if (!offline) void flushPending()
}
export function pendingCount(): number {
  return pending.length
}
export function listJobs(): Array<Job> {
  return [...jobs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100)
}

/** Run (or queue, if offline) an injection. Idempotent by job id. */
export async function runInjection(params: {
  threadId: string
  mode?: 'tool' | 'prompt'
  tool?: string
  args?: unknown
  message?: string
  trigger: Trigger
  jobId?: string
  channelId?: string
}): Promise<Job> {
  const id = params.jobId ?? newId('job')
  const existing = jobs.find((job) => job.id === id)
  if (existing) return existing // re-delivery of the same job id is a no-op

  const job: Job = {
    id,
    threadId: params.threadId,
    channelId: params.channelId,
    mode: params.mode ?? 'tool',
    tool: params.tool ?? '',
    args: params.args ?? {},
    message: params.message,
    trigger: params.trigger,
    status: 'accepted',
    createdAt: Date.now(),
  }
  jobs.push(job)
  seen.add(id)

  if (offline) {
    job.status = 'queued'
    pending.push(job)
    return job
  }
  return execute(job)
}

async function execute(job: Job): Promise<Job> {
  if (job.mode === 'prompt') {
    const { attached } = await runPrompt({
      threadId: job.threadId,
      message: job.message ?? '',
    })
    job.attached = attached
    job.status = 'accepted'
    return job
  }
  const harness = getHarnessForThread(job.threadId)
  const session = await getHost().open(harness, { threadId: job.threadId })
  const receipt = await applyInput(harness, session, {
    op: 'tool',
    name: job.tool,
    args: job.args,
    meta: { trigger: job.trigger, jobId: job.id },
  })
  job.status = receipt.status === 'rejected' ? 'rejected' : 'accepted'
  if (receipt.reason) job.reason = receipt.reason
  return job
}

/**
 * Trigger a model run and attach the thread's current pod memory as a
 * `systemPreamble`. This is the memory-attaching run trigger shared by the
 * interactive channel prompt (`/api/run`), subscription dispatch, and prompt-mode
 * webhooks — the agent author does nothing; the platform attaches the memory.
 */
export async function runPrompt(params: {
  threadId: string
  message: string
}): Promise<{ attached: number }> {
  const harness = getHarnessForThread(params.threadId)
  const session = await getHost().open(harness, { threadId: params.threadId })
  const systemPreamble = memoryPreamble(params.threadId)
  await applyInput(harness, session, {
    op: 'prompt',
    message: params.message,
    ...(systemPreamble.length ? { systemPreamble } : {}),
  })
  // Count entries (preamble has a header line + one line per entry).
  const attached = systemPreamble.length ? systemPreamble.length - 1 : 0
  return { attached }
}

/** Drain queued jobs when the host "reconnects" (offline toggled off). */
export async function flushPending(): Promise<void> {
  const toRun = pending.splice(0)
  for (const job of toRun) {
    job.status = 'accepted'
    await execute(job)
  }
}
