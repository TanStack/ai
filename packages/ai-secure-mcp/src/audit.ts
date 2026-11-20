import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** One line of the audit log. Secrets and tokens are never present. */
export interface AuditEntry {
  /** The client id, or undefined for an unauthenticated attempt. */
  client?: string
  /** What happened, for example `tool_call`, `auth_failure`, `egress_denied`. */
  event: string
  /** The tool name, when the event is a tool call. */
  tool?: string
  /** `ok`, `denied`, or `error`. */
  outcome: string
  /** The raw tool input. It is redacted before it is written. */
  args?: unknown
  /** The error code, when the outcome is an error. */
  code?: string
}

/**
 * Keeps only id-like fields; everything else is redacted. The match is a
 * suffix, so camelCase (`movieId`) and snake_case (`movie_id`) both count.
 *
 * Free-text fields such as `query`/`q` are intentionally excluded: a query
 * string is not id-like and can carry a secret (for example
 * `ALTER USER alice PASSWORD 'x'`). Retain one only through an explicit
 * per-tool allowlist that documents its safe content.
 */
const KEEP = /(id|ids|name|title|kind|type|scope|origin)$/i

/**
 * Redacts tool input to id-like fields. A non-object becomes a type tag. This
 * keeps a useful trail without storing a secret value.
 */
export function redactArgs(args: unknown): unknown {
  if (args === null || typeof args !== 'object') {
    return args === undefined ? undefined : `[${typeof args}]`
  }
  if (Array.isArray(args)) return '[array]'
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    out[key] =
      KEEP.test(key) && (typeof value === 'string' || typeof value === 'number')
        ? value
        : '[redacted]'
  }
  return out
}

export interface AuditLog {
  record: (entry: AuditEntry) => Promise<void>
}

/**
 * An append-only JSONL audit log. Each line is one event with a timestamp and
 * redacted args. On start it drops lines older than `retentionDays`.
 *
 * @param options.path - The JSONL file to append to
 * @param options.retentionDays - Days to keep; older lines are pruned on start
 * @param options.now - A clock in ms, for tests
 */
export function createAuditLog(options: {
  path: string
  retentionDays?: number
  now?: () => number
}): AuditLog {
  const now = options.now ?? (() => Date.now())
  // Reject a bad retention up front. A NaN or non-finite value makes `cutoff`
  // NaN, and then every `t >= cutoff` is false, so the first `record` would
  // wipe the whole history before appending. A negative value would prune
  // future entries. Validate at construction, before any file is touched.
  if (
    options.retentionDays !== undefined &&
    (!Number.isFinite(options.retentionDays) || options.retentionDays < 0)
  ) {
    throw new RangeError(
      `retentionDays must be a finite, non-negative number, got ${options.retentionDays}`,
    )
  }
  const init = async () => {
    await mkdir(dirname(options.path), { recursive: true }).catch(() => {})
    if (options.retentionDays === undefined) return
    const cutoff = now() - options.retentionDays * 86_400_000
    let text: string
    try {
      text = await readFile(options.path, 'utf8')
    } catch {
      return
    }
    const kept = text
      .split('\n')
      .filter(Boolean)
      .filter((line) => {
        try {
          const t = (JSON.parse(line) as { time?: number }).time
          return typeof t !== 'number' || t >= cutoff
        } catch {
          return false
        }
      })
    await writeFile(options.path, kept.length ? kept.join('\n') + '\n' : '')
  }
  // Prune and ensure the directory once, lazily on the first `record`. Running
  // init eagerly here would leave its rejection unhandled until a later
  // `record` awaits it, which can crash the process on Node's default handler.
  // A failure is preserved and surfaced to the caller of `record`.
  let ready: Promise<void> | undefined

  return {
    record: async (entry) => {
      ready ??= init()
      await ready
      const line = JSON.stringify({
        time: now(),
        client: entry.client,
        event: entry.event,
        tool: entry.tool,
        outcome: entry.outcome,
        code: entry.code,
        args: redactArgs(entry.args),
      })
      await appendFile(options.path, line + '\n', 'utf8')
    },
  }
}
