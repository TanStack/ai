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
 * Keeps only id-like and query-like fields; everything else is redacted. The
 * match is a suffix, so camelCase (`movieId`) and snake_case (`movie_id`) both
 * count.
 */
const KEEP = /(id|ids|query|q|name|title|kind|type|scope|origin)$/i

/**
 * Redacts tool input to id-like and query-like fields. A non-object becomes a
 * type tag. This keeps a useful trail without storing a secret value.
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
  // Prune and ensure the directory on first write, once.
  const ready = (async () => {
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
  })()

  return {
    record: async (entry) => {
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
