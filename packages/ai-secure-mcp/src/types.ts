/**
 * The fixed error taxonomy. Capabilities and the envelope refuse with one of
 * these codes. The code crosses every boundary intact, so a caller sees the
 * reason and never a leaked stack.
 */
export type ErrorCode =
  | 'invalid_input'
  | 'auth_failure'
  | 'forbidden_scope'
  | 'rate_limited'
  | 'egress_denied'
  | 'not_found'
  | 'backend_unavailable'
  | 'proposal_expired'
  | 'malformed_request'

/**
 * An error with a stable {@link ErrorCode}. The message is safe to show the
 * caller: put no secret in it.
 */
export class SecureMcpError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'SecureMcpError'
    this.code = code
  }
}

/**
 * One client of the server. The token is stored only as a SHA-256 hash.
 * The raw token lives in the client's own credential store, never here.
 */
export interface ClientRecord {
  /** A stable name for the client. Used in the audit log and notifications. */
  id: string
  /** Lowercase hex SHA-256 of the bearer token. See `hashToken`. */
  tokenHash: string
  /** The scopes this client holds. A tool can require one of these. */
  scopes: Array<string>
  /**
   * The resources this client can reach within a scope. When set, a tool with
   * a target parameter refuses a value that is not in this list.
   */
  targets?: Array<string>
  /** Unix seconds after which the token is invalid. */
  expiresAt?: number
}

/**
 * An event worth a human's attention. The notifier sends it off the box, so it
 * must carry no secret and no token material.
 */
export type SecurityEvent =
  | { kind: 'auth_failure'; client?: string; ip?: string }
  | { kind: 'forbidden_scope'; client: string; tool: string }
  | { kind: 'egress_denied'; origin: string; tool?: string }
  | { kind: 'rate_limited'; client: string }
  | { kind: 'approval_pending'; proposalId: string; summary: string }
  | { kind: 'malformed_request'; detail: string }

/**
 * A sink for {@link SecurityEvent}. It is best-effort and must never block or
 * throw into the request path.
 */
export interface SecurityNotifier {
  notify: (event: SecurityEvent) => Promise<void>
}

/** The per-tool access policy. A tool not named here needs only a valid token. */
export interface AccessPolicy {
  /** The scope a client must hold to call the named tool. */
  scopes?: Record<string, string>
  /**
   * The input field that names the target resource for the named tool. The
   * guard reads that field and checks it against the client's `targets`.
   */
  targetParam?: Record<string, string>
  /**
   * Tools that need two-phase approval (tier 3). A call returns a proposal
   * instead of acting; a later confirm runs the action.
   */
  approve?: Array<string>
}
