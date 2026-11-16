import { toolDefinition } from '@tanstack/ai'
import { buildBindings, buildPrelude, resolveAllowed } from './capability'
import { hashSnippet, verifyManifest } from './manifest'
import { intersectLimits, makeCallCounter } from './limits'
import { byteLength, shapeResult } from './result'
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
    manifest,
    snippet,
    facades,
    driver,
    serverCaps,
    policy,
    publicKey,
    requireSignature,
    onAudit,
  } = config

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

    // 2. Capability set: declared facades ∩ per-client policy.
    const allowed = resolveAllowed(manifest.inject, facades, authInfo, policy)
    const counter = makeCallCounter(limits.maxInjectedCalls)
    const bindings = buildBindings({
      allowed,
      facades,
      authInfo,
      signal,
      tick: counter.tick,
    })

    // 3. Run the snippet with only those bindings, under the merged limits.
    const ctx = await driver.createContext({
      bindings,
      timeout: limits.wallClockMs,
      memoryLimit: limits.memoryMb,
    })
    try {
      // Raw function-body code: top-level return/await. The driver wraps it
      // (async IIFE + JSON round-trip), so we must NOT wrap it ourselves.
      const code = `${buildPrelude(allowed, args)}\n${snippet}`
      const result = await ctx.execute(code, signal ? { signal } : undefined)

      if (!result.success) {
        const message = result.error?.message ?? 'execution failed'
        const limitHit = /timed out|memory|stack/i.test(message)
        audit(limitHit ? 'limit' : 'error', counter.count, 0, message)
        throw new Error(message)
      }

      // 4. Shape: author-declared truncation + result-size cap.
      const shaped = shapeResult(
        result.value,
        manifest.truncatable,
        limits.resultBytes,
      )
      audit('ok', counter.count, byteLength(shaped))
      return shaped
    } catch (error) {
      if (error instanceof Error && error.name === 'ResultTooLargeError') {
        audit('limit', counter.count, 0, error.message)
      }
      throw error
    } finally {
      await ctx.dispose()
    }
  })
}
