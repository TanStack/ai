import type { AuthInfo } from '@tanstack/ai-mcp/server'
import type { IsolateDriver, ToolBinding } from '@tanstack/ai-code-mode'

export type { AuthInfo, IsolateDriver, ToolBinding }

/** 1 = read-only, 2 = write, 3 = lasting write (two-phase approval). */
export type Tier = 1 | 2 | 3

/** Resource limits an isolate run is held to. */
export interface Limits {
  /** Wall-clock budget for the whole run, ms. */
  wallClockMs: number
  /** Isolate heap cap, MB. */
  memoryMb: number
  /** Max host-facade calls a single run may make. */
  maxInjectedCalls: number
  /** Max serialized result size, bytes (over → truncate `truncatable`, then error). */
  resultBytes: number
}

/**
 * The security contract for a sandboxed tool. Ships next to the snippet.
 * `signature` is optional in the format; policy (`requireSignature`) makes it
 * mandatory when a registry is writable by anyone but the operator.
 */
export interface Manifest {
  name: string
  version: string
  tier: Tier
  /** Required OAuth scope — checked per-tool against the caller's token. */
  scope: string
  /** Dotted facade names this tool may call, e.g. `["http.get"]`. */
  inject: ReadonlyArray<string>
  limits: Limits
  /** Dotted paths into the result the author allows to be truncated. */
  truncatable: ReadonlyArray<string>
  /** JSON Schema for the tool's input. */
  inputSchema: Record<string, unknown>
  description: string
  /** Hex SHA-256 of the exact snippet source this manifest authorizes. */
  snippetHash: string
  /** Base64 Ed25519 signature over the canonical manifest (minus this field). */
  signature?: string
  /** Set by the importer. A tool with this flag is refused at build time. */
  unreviewed?: boolean
}

/** Context a facade receives on every call. */
export interface FacadeContext {
  authInfo: AuthInfo
  clientId: string
  signal?: AbortSignal
}

/**
 * A host-side capability. Narrow and typed: the snippet calls it as
 * `host.<namespace>.<fn>(input)`. Secrets and backend URLs live in the
 * closure here, never in the isolate.
 */
export interface Facade {
  description?: string
  inputSchema?: Record<string, unknown>
  execute: (args: unknown, ctx: FacadeContext) => Promise<unknown>
}

/** Facades keyed by the dotted name used in `Manifest.inject`. */
export type Facades = Record<string, Facade>

/**
 * Per-client capability filter. Return the subset of declared facade names
 * this caller may use (default: all declared). Value-level policy
 * (e.g. which targets) is enforced inside the facade via `FacadeContext`.
 */
export type ClientPolicy = (
  authInfo: AuthInfo,
  declared: ReadonlyArray<string>,
) => ReadonlyArray<string>

/** Audit record emitted once per run (success or failure). */
export interface AuditEntry {
  clientId: string
  tool: string
  snippetHash: string
  scope: string
  injectedCalls: number
  durationMs: number
  resultBytes: number
  outcome: 'ok' | 'denied' | 'error' | 'limit'
  error?: string
}

export interface SandboxedToolConfig {
  manifest: Manifest
  /** The snippet source. Its SHA-256 must equal `manifest.snippetHash`. */
  snippet: string
  facades: Facades
  driver: IsolateDriver
  /** Server-wide caps; the run uses `min(manifest.limits, serverCaps)`. */
  serverCaps?: Partial<Limits>
  policy?: ClientPolicy
  /** PEM Ed25519 public key. Required when `requireSignature` is true. */
  publicKey?: string
  /** Refuse to build unless the manifest carries a valid signature. */
  requireSignature?: boolean
  onAudit?: (entry: AuditEntry) => void
}
