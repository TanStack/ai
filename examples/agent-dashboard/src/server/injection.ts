/**
 * Injection: run a public tool out-of-band on the embedded host — no model turn,
 * zero tokens. One code path (`runInjection`) behind three triggers (timer,
 * manual, webhook). The tool's result is published into the session feed by the
 * harness `{ op: 'tool' }` op, so it reaches the channel view via the live tail
 * and is persisted for replay/history like any other run.
 *
 * The harness inbox keeps an input that arrives while a turn runs, and the
 * persisted stores keep it across a restart, so there is no queue here.
 *
 * Server-only. This module also owns the schedule/webhook registries because the
 * dashboard owns the clock (the server ticks; see scheduler.ts).
 */
import { applyInput } from '@tanstack/ai-harness'
import { openThread } from './harness'
import { memoryPreamble } from './memory'
import { overBudget } from './spend'
import { fileMap } from './store'

export type Trigger = 'timer' | 'manual' | 'webhook' | 'mcp'

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
  status: 'accepted' | 'rejected'
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
  lastRunAt?: number
}

export interface WebhookDelivery {
  id: string
  at: number
  payload: unknown
  status: Job['status']
  reason?: string
  jobId: string
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
  deliveries: Array<WebhookDelivery>
}

const jobs: Array<Job> = []

// Durable: written through to the state file on every set/delete (see store.ts).
// A schedule that came due while the server was down fires once on next boot.
export const schedules = fileMap<Schedule>('schedules')
export const webhooks = fileMap<Webhook>('webhooks')

let seq = 0
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`
}

export function listJobs(): Array<Job> {
  return [...jobs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100)
}

/** Run an injection. Idempotent by job id. */
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
  return execute(job)
}

async function execute(job: Job): Promise<Job> {
  if (job.mode === 'prompt') {
    const { attached, rejected } = await runPrompt({
      threadId: job.threadId,
      message: job.message ?? '',
    })
    job.attached = attached
    job.status = rejected ? 'rejected' : 'accepted'
    if (rejected) job.reason = rejected
    return job
  }
  const { harness, session } = await openThread(job.threadId)
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
}): Promise<{ attached: number; rejected?: 'over_budget' }> {
  if (await overBudget(params.threadId)) {
    return { attached: 0, rejected: 'over_budget' }
  }
  const { session } = await openThread(params.threadId)
  const systemPreamble = memoryPreamble(params.threadId)
  // `systemPreamble` is server-only: a client input can't carry one.
  session
    .prompt(params.message, systemPreamble.length ? { systemPreamble } : {})
    .then(
      () => {},
      () => {},
    )
  // Count entries (preamble has a header line + one line per entry).
  const attached = systemPreamble.length ? systemPreamble.length - 1 : 0
  return { attached }
}
