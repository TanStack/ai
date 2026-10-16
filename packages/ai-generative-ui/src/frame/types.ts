/**
 * Open Generative UI Specification (Draft 0.2) — The Frame Tier.
 *
 * Clean-room TypeScript type definitions for Tier F: persistent artifacts,
 * the serving shell, the bridge protocol, and the module registry.
 *
 * Draft 0.1 (`./types.ts`) remains in force for Tier N (catalog node graph);
 * this file adds the second tier without disturbing it.
 */

/** Protocol namespace + version carried on every bridge envelope (§6.1). */
export const FRAME_PROTOCOL = 'ogui/1'

/* -------------------------------------------------------------------------- */
/* Artifact record (§3.1)                                                     */
/* -------------------------------------------------------------------------- */

/** An artifact's authoring form. `full-document` is a non-goal (§7.2). */
export type ArtifactKind = 'html-fragment' | 'react-tsx'

/** Sharing scope of a stored artifact (§3.1 ownership). */
export type ArtifactScope = 'private' | 'pod' | 'public-link'

/** Trust tier, inherited from Draft 0.1 §7.4.1, gating unattended use (§9.2.7). */
export type TrustTier = 'untrusted' | 'reviewed' | 'trusted'

/** Which driver produced this revision (§3.1 provenance, Draft 0.1 §7). */
export interface ArtifactProvenance {
  driver: 'live' | 'programmatic' | 'constructor' | 'fixture'
  agentId?: string
  runId?: string
  /**
   * Set when a constructor (§8.3) expanded to this source. Named `constructorRef`
   * rather than the spec's `constructor` to avoid the `Object.prototype.constructor`
   * clash in TypeScript.
   */
  constructorRef?: { name: string; version: string }
}

/** Owner + scope + originating channel (§3.1). */
export interface ArtifactOwnership {
  ownerId: string
  scope: ArtifactScope
  channelId?: string
}

/**
 * One immutable revision of a stored Tier F UI (§3.1). `artifactId` is stable
 * across revisions; every edit is a new `revision` with its own `contentHash`.
 */
export interface ArtifactRecord {
  artifactId: string
  revision: number
  /** sha256 over source + registry version — content-addresses the build. */
  contentHash: string
  kind: ArtifactKind
  title: string
  /** REQUIRED degradation text (Draft 0.1 §9.2 applies in full, §5.3). */
  fallbackText: string
  /** As authored — a fragment or one TSX module. */
  source: string
  /** react-tsx only: reference to the built bundle in blob storage (§7.3.3). */
  builtRef?: string
  /** Compiler output, including errors (§7.3.3). */
  buildLog?: string
  /** react-tsx only: the registry version the source was built against (§7.3.2). */
  registryVersion?: string
  /** connect-src domains granted for this revision (§9.3). */
  networkGrants?: Array<string>
  /**
   * Authoritative host data for the artifact — react-tsx `props.data` and the
   * bridge `host.init.data` (§6.2, §7.3.4). Numbers presented as computed come
   * from here, not from model arithmetic.
   */
  data?: unknown
  provenance: ArtifactProvenance
  ownership: ArtifactOwnership
  trustTier: TrustTier
  createdAt: string
  /** The previous revision number, if any. */
  supersedes?: number
}

/** A chat message pins exactly one `{artifactId, revision}` (§3.3). */
export interface ArtifactPin {
  artifactId: string
  revision: number
}

/* -------------------------------------------------------------------------- */
/* Module registry (§7.3.2)                                                   */
/* -------------------------------------------------------------------------- */

/** One allow-listed module a react-tsx artifact may import (§7.3.2). */
export interface ModuleRegistryEntry {
  /** The import specifier the artifact uses, e.g. `@tanstack/react-table`. */
  name: string
  version: string
  /** Sandbox-origin URL the shell's import map resolves `name` to. */
  url: string
  /** One-line description surfaced to the model in authoring guidance. */
  description: string
}

/** A versioned, pinned manifest of importable modules (§7.3.2). */
export interface ModuleRegistry {
  version: string
  modules: Array<ModuleRegistryEntry>
}

/* -------------------------------------------------------------------------- */
/* Build at write time (§7.3.3)                                               */
/* -------------------------------------------------------------------------- */

/** A single build diagnostic returned to the model as a tool result (§7.3.3). */
export interface BuildDiagnostic {
  message: string
  line?: number
  column?: number
  /** For disallowed imports: the specifier that failed the allowlist. */
  specifier?: string
}

/**
 * Result of building an artifact source. On failure, `diagnostics` are the
 * model-facing tool result; the compile loop stays in the conversation (§7.3.3).
 */
export interface BuildResult {
  ok: boolean
  /** Built ESM bundle (react-tsx) with registry modules left external. */
  code?: string
  /** sha256 of `code` — content-addresses the bundle in blob storage (§3.2). */
  contentHash?: string
  /** Human/model-readable compiler output. */
  buildLog: string
  diagnostics?: Array<BuildDiagnostic>
  /** Registry specifiers the built bundle imports (for the shell import map). */
  externals?: Array<string>
}

/**
 * The server-side compiler contract (§7.3.3). The package defines the shape
 * and the import-allowlist check; a host injects the real builder (esbuild in
 * the reference host) so the published package stays browser-safe.
 */
export interface ArtifactBuilder {
  build: (input: {
    kind: ArtifactKind
    source: string
    registry: ModuleRegistry
  }) => Promise<BuildResult>
}

/* -------------------------------------------------------------------------- */
/* Theme (§5.2)                                                               */
/* -------------------------------------------------------------------------- */

/** Host design tokens projected onto the frame `:root` as CSS variables (§5.2). */
export interface FrameTheme {
  /** `light` | `dark` — set as `data-theme` on the frame root (§5.2). */
  mode: 'light' | 'dark'
  /** Semantic token map: CSS custom-property name → value, e.g. `--ui-bg`. */
  tokens: Record<string, string>
}

/* -------------------------------------------------------------------------- */
/* Bridge protocol (§6)                                                       */
/* -------------------------------------------------------------------------- */

export type FrameMessageType =
  // frame → host
  | 'frame.ready'
  | 'frame.resize'
  | 'frame.error'
  | 'frame.state.set'
  | 'frame.intent.submit'
  | 'frame.intent.action'
  // host → frame
  | 'host.init'
  | 'host.theme'
  | 'host.state'
  | 'host.intent.result'
  | 'host.data'

/** The single envelope for all host↔frame `postMessage` traffic (§6.1). */
export interface BridgeEnvelope<P = unknown> {
  ns: typeof FRAME_PROTOCOL
  type: FrameMessageType
  artifactId: string
  instanceId: string
  /** Present when a response is expected (request/response correlation). */
  requestId?: string
  payload: P
}

/* ---- frame → host payloads (§6.2) ---------------------------------------- */

export interface FrameReadyPayload {
  kind: ArtifactKind
  shellVersion: string
}

export interface FrameResizePayload {
  height: number
}

export interface FrameErrorPayload {
  message: string
  stack?: string
}

export interface FrameStateSetPayload {
  /** Full replacement; the host persists it per instance (§6.3, §6.4). */
  state: Record<string, unknown>
}

export interface FrameIntentPayload {
  intent: string
  payload?: unknown
  /** Snapshot of durable instance state at intent time. */
  state: Record<string, unknown>
}

/* ---- host → frame payloads (§6.2) ---------------------------------------- */

export interface HostInitPayload {
  theme: FrameTheme
  state: Record<string, unknown>
  data?: unknown
  registryVersion?: string
}

export interface HostThemePayload {
  theme: FrameTheme
}

export interface HostStatePayload {
  state: Record<string, unknown>
}

export interface HostIntentResultPayload {
  requestId: string
  ok: boolean
  result?: unknown
  error?: string
}

export interface HostDataPayload {
  data: unknown
}

/* -------------------------------------------------------------------------- */
/* Artifact tools (§8.1)                                                      */
/* -------------------------------------------------------------------------- */

export interface CreateArtifactInput {
  kind: ArtifactKind
  title: string
  source: string
  fallbackText: string
  data?: unknown
  scope?: ArtifactScope
  /** Requested connect-src domains; host grants a subset (§9.3). */
  networkGrants?: Array<string>
}

export interface ReviseArtifactInput {
  artifactId: string
  source: string
  note?: string
}

export interface ArtifactToolSuccess {
  artifactId: string
  revision: number
  url: string
}

export interface ArtifactToolBuildError {
  error: 'build-failed'
  buildLog: string
  diagnostics: Array<BuildDiagnostic>
}

export type ArtifactToolResult = ArtifactToolSuccess | ArtifactToolBuildError
