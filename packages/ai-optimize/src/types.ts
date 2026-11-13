import type { FieldProjection, TruncateStrategy } from '@tanstack/ai'

/**
 * A projection event. One is emitted per projected field, and one per
 * retrieval. Delivered via the config `onEvent` callback and summarized in the
 * `tanstack.optimize` log record. No event → no projection happened.
 */
export type OptimizationEvent =
  | {
      type: 'projected'
      toolName: string
      toolCallId: string
      fieldPath: string
      strategy: TruncateStrategy
      /** Estimate — surfaced with a `~`. */
      originalTokens: number
      /** Estimate — surfaced with a `~`. `0` for `drop_with_ref`. */
      keptTokens: number
      ref?: string
    }
  | {
      type: 'retrieved'
      toolName: string
      toolCallId: string
      fieldPath: string
      ref: string
    }

/**
 * A fully-resolved field projection — every default filled in. The projection
 * engine only ever sees these, never the partial author/consumer shapes.
 */
export interface ResolvedFieldProjection {
  truncate: TruncateStrategy
  aboveTokens: number
  maxTokens: number
  retrievable: boolean
}

/** Resolved projection policy for one tool's result. */
export interface ResolvedResultPolicy {
  /** Explicit per-path field rules (author adornment + optimize per-tool
   *  override, author wins per field). `$` = the whole result. */
  fields: Record<string, ResolvedFieldProjection>
  /** Universal default applied to un-ruled content. `leaves` truncates each
   *  oversized string leaf; `flatten` serializes the whole result and truncates
   *  it as one string. Absent when no `optimize()` defaults were configured. */
  default?: { mode: 'leaves' | 'flatten'; projection: ResolvedFieldProjection }
  /** Whether failed results are projected. Default false (errors exempt). */
  includeErrors: boolean
}

/** Resolved projection policy for one completed tool call's arguments. */
export interface ResolvedArgsPolicy {
  fields: Record<string, ResolvedFieldProjection>
}

// ---- Consumer-facing `optimize()` config (§5.5) -------------------------

/** A field rule as written in `optimize()`: a bare strategy, or an object with
 *  per-field overrides. (Author adornment uses the flat {@link FieldProjection}
 *  from core instead.) */
export interface OptimizeFieldRule {
  truncate:
    | TruncateStrategy
    | {
        strategy: TruncateStrategy
        aboveTokens?: number
        maxTokens?: number
        retrievable?: boolean
      }
}

export interface OptimizeDefaults {
  truncate: {
    strategy: TruncateStrategy
    aboveTokens?: number
    maxTokens?: number
    retrievable?: boolean
  }
  /** `'leaves'` (default): each oversized string leaf truncated independently.
   *  `'flatten'`: the whole result serialized and truncated as one string. */
  mode?: 'leaves' | 'flatten'
}

export interface OptimizeToolOverride {
  result?: {
    fields?: Record<string, OptimizeFieldRule>
    includeErrors?: boolean
  }
  /** Args rules exist ONLY here (D3): never author-declared, never universal.
   *  Forbidden on `needsApproval` tools (enforced in `policies.ts`). */
  args?: {
    fields?: Record<string, OptimizeFieldRule>
  }
}

export interface OptimizeConfig {
  /** Universal defaults applied to result fields only. */
  defaults?: OptimizeDefaults
  /** Per-tool overrides keyed by tool name. */
  tools?: Record<string, OptimizeToolOverride>
  /** Tools that are never projected (beats every other rule). */
  exclude?: Array<string>
  /** Sink for every projection / retrieval event. */
  onEvent?: (event: OptimizationEvent) => void
}

export type { FieldProjection }
