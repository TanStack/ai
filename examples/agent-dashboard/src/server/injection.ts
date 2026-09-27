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

export type Trigger = 'timer' | 'manual' | 'webhook'

export interface Job {
  id: string
  threadId: string
  channelId?: string
  tool: string
  args: unknown
  trigger: Trigger
  status: 'queued' | 'accepted' | 'rejected'
  reason?: string
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
  tool: string
  /** Maps a tool arg name → a dot path into the webhook payload. */
  argMapping: Record<string, string>
}

const jobs: Array<Job> = []
const pending: Array<Job> = []
const seen = new Set<string>()
let offline = false

export const schedules = new Map<string, Schedule>()
export const webhooks = new Map<string, Webhook>()

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

/** Run (or queue, if offline) a single public tool. Idempotent by job id. */
export async function runInjection(params: {
  threadId: string
  tool: string
  args?: unknown
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
    tool: params.tool,
    args: params.args ?? {},
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

/** Drain queued jobs when the host "reconnects" (offline toggled off). */
export async function flushPending(): Promise<void> {
  const toRun = pending.splice(0)
  for (const job of toRun) {
    job.status = 'accepted'
    await execute(job)
  }
}
