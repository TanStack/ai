import { toolDefinition } from '@tanstack/ai'
import { hashSnippet, verifyManifest } from './manifest'
import { intersectLimits } from './limits'
import { byteLength } from './result'
import { runSandboxed } from './run'
import type { SandboxRunResult } from './run'
import type { MCPToolContext } from '@tanstack/ai-mcp/server'
import type { AuditEntry, Manifest, SandboxedToolConfig, Tier } from './types'

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized: no verified caller identity')
    this.name = 'UnauthorizedError'
  }
}

export class ScopeDeniedError extends Error {
  constructor(scope: string) {
    super(`forbidden: missing required scope "${scope}"`)
    this.name = 'ScopeDeniedError'
  }
}

/** MCP annotation hints a well-behaved host may prompt on (advisory only). */
function tierAnnotations(tier: Tier): Record<string, boolean> {
  return {
    readOnlyHint: tier === 1,
    destructiveHint: tier === 3,
  }
}

/**
 * Reject a manifest/snippet pair that must not be served. Runs once, at
 * build time: tamper (hash mismatch), unreviewed import, or missing/invalid
 * signature under policy.
 */
function assertServable(
  manifest: Manifest,
  snippet: string,
  publicKey: string | undefined,
  requireSignature: boolean | undefined,
): void {
  if (manifest.unreviewed) {
    throw new Error(
      `Tool "${manifest.name}" is unreviewed (imported, security fields not filled). Refusing to serve.`,
    )
  }
  if (hashSnippet(snippet) !== manifest.snippetHash) {
    throw new Error(
      `Tool "${manifest.name}": snippet hash does not match manifest.snippetHash.`,
    )
  }
  if (requireSignature) {
    if (!publicKey) {
      throw new Error(
        `Tool "${manifest.name}": requireSignature is set but no publicKey was provided.`,
      )
    }
    if (!verifyManifest(manifest, publicKey)) {
      throw new Error(`Tool "${manifest.name}": manifest signature is invalid.`)
    }
  } else if (manifest.signature && publicKey) {
    // Not required, but if both are present a bad signature still means tamper.
    if (!verifyManifest(manifest, publicKey)) {
      throw new Error(`Tool "${manifest.name}": manifest signature is invalid.`)
    }
  }
}

/**
 * Turn a signed snippet + manifest into a plain `ServerTool` that runs the
 * snippet inside an isolate, capability-scoped per caller. Drops straight into
 * `createMCPServer({ tools: [...] })` alongside trusted tools.
 */
export function sandboxedTool(config: SandboxedToolConfig) {
  const {
    manifest: callerManifest,
    snippet,
    facades,
    driver,
    serverCaps,
    policy,
    publicKey,
    requireSignature,
    onAudit,
  } = config

  // Snapshot the manifest once so the verified contract is a fixed snapshot:
  // host code that still holds the config object cannot mutate manifest.scope,
  // manifest.inject, or manifest.truncatable after construction and have the
  // next call read the new values without a fresh signature check.
  const manifest = structuredClone(callerManifest)
  assertServable(manifest, snippet, publicKey, requireSignature)
  const limits = intersectLimits(manifest.limits, serverCaps)

  return toolDefinition({
    name: manifest.name,
    description: manifest.description,
    inputSchema: manifest.inputSchema,
    metadata: { annotations: tierAnnotations(manifest.tier) },
  }).server<MCPToolContext>(async (args, context) => {
    const started = Date.now()
    const authInfo = context.context.authInfo
    const signal = context.abortSignal

    const audit = (
      outcome: AuditEntry['outcome'],
      injectedCalls: number,
      resultBytes: number,
      error?: string,
    ) => {
      onAudit?.({
        clientId: authInfo?.clientId ?? 'anonymous',
        tool: manifest.name,
        snippetHash: manifest.snippetHash,
        scope: manifest.scope,
        injectedCalls,
        durationMs: Date.now() - started,
        resultBytes,
        outcome,
        error,
      })
    }

    // 1. Per-tool scope gate (the server's requiredScopes is too coarse).
    if (!authInfo) {
      audit('denied', 0, 0, 'unauthorized')
      throw new UnauthorizedError()
    }
    if (!authInfo.scopes.includes(manifest.scope)) {
      audit('denied', 0, 0, 'scope_denied')
      throw new ScopeDeniedError(manifest.scope)
    }

    // 2-4. Capability set (declared facades ∩ per-client policy), isolate run
    // under the merged limits, and result shaping all live in runSandboxed.
    let run: SandboxRunResult
    try {
      run = await runSandboxed({
        snippet,
        input: args,
        facades,
        inject: manifest.inject,
        driver,
        limits,
        truncatable: manifest.truncatable,
        authInfo,
        policy,
        signal,
      })
    } catch (error) {
      // Setup failed (unknown facade, driver start) or the run was aborted: one record.
      const message = error instanceof Error ? error.message : String(error)
      audit('error', 0, 0, message)
      throw error
    }

    if (!run.ok) {
      audit(run.kind, run.injectedCalls, 0, run.error)
      throw new Error(run.error)
    }
    audit('ok', run.injectedCalls, byteLength(run.value))
    return run.value
  })
}
