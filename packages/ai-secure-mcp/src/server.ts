import { createMCPServer } from '@tanstack/ai-mcp/server'
import { bearerToken, verifyToken } from './auth'
import { createApprovalStore } from './approval'
import { createAuditLog } from './audit'
import { createEgress } from './egress'
import { createConfirmTool, guardTools } from './guard'
import { isSilentNotifier, safeNotifier, silentNotifier } from './notifier'
import { createRateLimiter } from './rate-limit'
import { preflight, tailscaleCommand } from './deploy'
import { SecureMcpError } from './types'
import type { AuthInfo } from '@modelcontextprotocol/server'
import type { AnyServerTool } from '@tanstack/ai'
import type { SampleRequest } from '@tanstack/ai-mcp/server'
import type { AuditLog } from './audit'
import type { PreflightResult } from './deploy'
import type { GuardContext } from './guard'
import type { AccessPolicy, ClientRecord, SecurityNotifier } from './types'

/** Config for {@link createSecureMcpServer}. */
export interface SecureMcpConfig {
  name: string
  version: string
  /** The tools to serve. The envelope wraps each one with the access guard. */
  tools: ReadonlyArray<AnyServerTool>
  /** The known clients, by token hash. See `hashToken` and `clientsFromFile`. */
  clients: ReadonlyArray<ClientRecord>
  /**
   * The allowlist for `ctx.context.egress`. Without it, that helper refuses
   * every origin. It does not stop a tool that calls global `fetch`.
   */
  egress?:
    | ReadonlyArray<string>
    | { allow: ReadonlyArray<string>; timeoutMs?: number }
  /** Per-tool scope, target, and approval rules. */
  policy?: AccessPolicy
  /** Sliding-window rate limit per client. `false` turns it off. */
  rateLimit?: { limit: number; windowMs: number } | false
  /**
   * Redacted JSONL audit log. It is off unless you set it: pass `{ path }` to
   * turn it on. A public funnel needs it.
   */
  audit?: { path: string; retentionDays?: number } | false
  /** Where to send tripwire events. Defaults to a silent sink. */
  notify?: SecurityNotifier
  /** Two-phase approval settings. */
  approval?: { ttlMs?: number }
  /** Builds the host-side summary shown with an approval request. */
  summarize?: (toolName: string, args: unknown) => string
  /** When set, the result carries the Tailscale command to expose the server. */
  funnel?: { port: number; public?: boolean }
  /** The model adapter for `ctx.context.sample` on spec 2026. */
  sample?: (request: SampleRequest) => Promise<unknown>
}

/** The result of {@link createSecureMcpServer}. */
export interface SecureMcpServer {
  /** Serve one HTTP request. Does auth, rate-limit, audit, then delegates. */
  fetch: (request: Request) => Promise<Response>
  /** The secure-default check computed from the config. */
  preflight: PreflightResult
  /** The Tailscale command, when `funnel` is set. */
  tailscale?: { command: string; note: string }
}

const FAR_FUTURE = 4_102_444_800 // 2100-01-01, for a token with no expiry
/** Above this, an `expiresAt` is milliseconds, not seconds (year 5138). */
const MAX_EXPIRES_AT = 1e11
/**
 * The auth failures, and the rate-limit refusals per client, that are audited
 * and notified per window. More only get the 401 or 429.
 */
const TRIPWIRE_BUDGET = { limit: 10, windowMs: 60_000 }

function jsonError(status: number, code: string, headers?: HeadersInit) {
  return new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/**
 * Wraps `createMCPServer` with the security envelope a self-hoster needs to
 * expose a server to the internet: hashed-token auth, scopes and a target
 * allowlist, a deny-by-default egress helper, rate limits, a redacted audit
 * log, a tripwire notifier, and two-phase approval.
 *
 * It throws `invalid_input` when the config cannot be enforced as written: a
 * policy that names an unknown tool, a duplicate client id, an `expiresAt` in
 * milliseconds, or an egress entry that is not an http(s) origin. It also
 * throws when `funnel.public` is set while the preflight finds a problem: no
 * clients, a token that is not a SHA-256 hash, audit off, or notifier off.
 */
export function createSecureMcpServer(
  config: SecureMcpConfig,
): SecureMcpServer {
  // Wrap the notifier so a custom `notify` that rejects cannot become an
  // unhandled rejection on any of the fire-and-forget (`void`) call sites.
  const notify = safeNotifier(config.notify ?? silentNotifier())
  const audit: AuditLog | undefined =
    config.audit === false || config.audit === undefined
      ? undefined
      : createAuditLog(config.audit)

  let allow: ReadonlyArray<string> = []
  let egressTimeoutMs: number | undefined
  if (config.egress !== undefined) {
    if ('allow' in config.egress) {
      allow = config.egress.allow
      egressTimeoutMs = config.egress.timeoutMs
    } else {
      allow = config.egress
    }
  }
  const egress = createEgress({
    allow,
    ...(egressTimeoutMs === undefined ? {} : { timeoutMs: egressTimeoutMs }),
    onDenied: (origin) => void notify.notify({ kind: 'egress_denied', origin }),
  })

  const ids = new Set<string>()
  for (const client of config.clients) {
    // Two records with one id share a rate-limit bucket and can confirm each
    // other's proposals.
    if (ids.has(client.id)) {
      throw new SecureMcpError(
        'invalid_input',
        `Client id "${client.id}" is used more than once.`,
      )
    }
    ids.add(client.id)
    // `expiresAt` is Unix seconds. A value from `Date.now()` is milliseconds
    // and would expire in about 50,000 years.
    if (client.expiresAt !== undefined && client.expiresAt > MAX_EXPIRES_AT) {
      throw new SecureMcpError(
        'invalid_input',
        `Client "${client.id}" has an expiresAt in milliseconds. Use Unix seconds.`,
      )
    }
  }

  const policy: AccessPolicy = config.policy ?? {}
  const approvals = createApprovalStore<GuardContext>(config.approval)
  const summarize =
    config.summarize ?? ((toolName: string) => `Run ${toolName}`)

  const guarded = guardTools(config.tools, {
    policy,
    approvals,
    audit,
    notify,
    summarize,
  })
  const tools: Array<AnyServerTool> = policy.approve?.length
    ? [...guarded, createConfirmTool({ approvals, audit })]
    : guarded

  const inner = createMCPServer({
    name: config.name,
    version: config.version,
    tools,
    ...(config.sample === undefined ? {} : { sample: config.sample }),
  })

  const rl =
    config.rateLimit === false
      ? undefined
      : createRateLimiter(config.rateLimit ?? { limit: 60, windowMs: 60_000 })

  const check = preflight({
    clients: config.clients,
    auditOn: audit !== undefined,
    notifierOn: config.notify !== undefined && !isSilentNotifier(config.notify),
  })
  if (config.funnel?.public === true && !check.ok) {
    throw new SecureMcpError(
      'invalid_input',
      `Refusing to expose a public funnel. Fix: ${check.problems.join(' ')}`,
    )
  }

  const nowSeconds = () => Math.floor(Date.now() / 1000)

  // An unauthenticated caller has no client id to rate-limit, and each failure
  // writes to disk and pings the notifier. Only the first failures in each
  // window are audited and notified, so a scanner cannot fill the disk or
  // flood the phone. Every failure still gets a 401. A client over its own
  // rate limit gets the same budget, keyed by its id.
  // ponytail: one global auth budget, a per-IP budget if one scanner should
  // not hide another.
  const tripwireBudget = createRateLimiter(TRIPWIRE_BUDGET)
  const denyAuth = async (): Promise<Response> => {
    if (tripwireBudget.allow('auth_failure')) {
      void notify.notify({ kind: 'auth_failure' })
      await audit?.record({ event: 'auth_failure', outcome: 'denied' })
    }
    return jsonError(401, 'auth_failure', { 'www-authenticate': 'Bearer' })
  }

  const fetch = async (request: Request): Promise<Response> => {
    const token = bearerToken(request.headers.get('authorization'))
    if (token === undefined) return denyAuth()

    let client: ClientRecord
    try {
      client = verifyToken(token, config.clients, nowSeconds())
    } catch {
      return denyAuth()
    }

    if (rl !== undefined && !rl.allow(client.id)) {
      if (tripwireBudget.allow(`rate_limited:${client.id}`)) {
        void notify.notify({ kind: 'rate_limited', client: client.id })
        await audit?.record({
          client: client.id,
          event: 'rate_limited',
          outcome: 'denied',
        })
      }
      return jsonError(429, 'rate_limited')
    }

    const authInfo: AuthInfo = {
      token: '[redacted]',
      clientId: client.id,
      scopes: client.scopes,
      expiresAt: client.expiresAt ?? FAR_FUTURE,
      extra: {},
    }

    return inner.handle(request, {
      authInfo,
      context: { secure: { client }, egress },
    })
  }

  return {
    fetch,
    preflight: check,
    ...(config.funnel === undefined
      ? {}
      : { tailscale: tailscaleCommand(config.funnel) }),
  }
}
