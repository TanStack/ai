import { hashSnippet } from './manifest'
import type { Manifest } from './types'

/** Tightest defaults an imported-but-unreviewed tool is pinned to. */
const DENY_BY_DEFAULT_LIMITS = {
  wallClockMs: 1000,
  memoryMb: 32,
  maxInjectedCalls: 0,
  resultBytes: 16 * 1024,
} as const

export interface ImportOptions {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  version?: string
}

/**
 * Convert a plain Code Mode snippet into a sandboxed-tool manifest. The snippet
 * body carries over verbatim; the manifest is generated **deny-by-default**:
 * no injections, tightest limits, Tier 1, and `unreviewed: true` — which makes
 * `sandboxedTool()` refuse to serve it. A human must fill the security fields
 * (and sign, under policy) before the tool runs. Authoring-time only.
 */
export function importSnippet(
  snippet: string,
  options: ImportOptions,
): Manifest {
  return {
    name: options.name,
    version: options.version ?? '0.0.0',
    tier: 1,
    scope: `${options.name}:TODO`,
    inject: [],
    limits: { ...DENY_BY_DEFAULT_LIMITS },
    truncatable: [],
    inputSchema: options.inputSchema ?? { type: 'object' },
    description: options.description ?? `TODO: describe ${options.name}`,
    snippetHash: hashSnippet(snippet),
    unreviewed: true,
  }
}
