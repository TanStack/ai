import { describe, expect, it } from 'vitest'
import {
  ProjectionCapability,
  getWorkspaceProjection,
  provideWorkspaceProjection,
} from '../src/projection'
import { createSecrets, resolveSecret } from '../src/secrets'
import type { WorkspaceProjection } from '../src/projection'
import type { CapabilityContext } from '@tanstack/ai'

/** Minimal capability context sufficient for testing capability round-trips. */
function makeCtx(): CapabilityContext {
  return { capabilities: { markProvided: () => undefined } } as unknown as CapabilityContext
}

function makeProjection(overrides?: Partial<WorkspaceProjection>): WorkspaceProjection {
  return {
    skills: [],
    plugins: [],
    resolveSecret: () => '',
    markerPath: '/workspace/.tanstack-projected-abc123',
    root: '/workspace',
    ...overrides,
  }
}

describe('ProjectionCapability', () => {
  it('round-trips: provide then get returns the same object', () => {
    const ctx = makeCtx()
    const projection = makeProjection()

    provideWorkspaceProjection(ctx, projection)

    const result = getWorkspaceProjection(ctx, { optional: true })
    expect(result).toBe(projection)
  })

  it('resolveSecret resolves a ref built via createSecrets', () => {
    const ctx = makeCtx()
    const secrets = createSecrets({ GITHUB_TOKEN: 'ghp_test123' })
    const projection = makeProjection({
      resolveSecret: (ref) => resolveSecret(secrets, ref),
    })

    provideWorkspaceProjection(ctx, projection)
    const result = getWorkspaceProjection(ctx)
    expect(result.resolveSecret(secrets.GITHUB_TOKEN)).toBe('ghp_test123')
  })

  it('absent capability returns undefined with optional: true', () => {
    const ctx = makeCtx()
    const result = getWorkspaceProjection(ctx, { optional: true })
    expect(result).toBeUndefined()
  })

  it('absent capability throws without optional flag', () => {
    const ctx = makeCtx()
    expect(() => getWorkspaceProjection(ctx)).toThrow(
      'Capability "sandbox-projection" was requested but never provided',
    )
  })

  it('ProjectionCapability.capabilityName is sandbox-projection', () => {
    expect(ProjectionCapability.capabilityName).toBe('sandbox-projection')
  })

  it('has() returns false before providing and true after', () => {
    const ctx = makeCtx()
    expect(ProjectionCapability.has(ctx)).toBe(false)
    provideWorkspaceProjection(ctx, makeProjection())
    expect(ProjectionCapability.has(ctx)).toBe(true)
  })

  it('skills and plugins arrays are stored as-is', () => {
    const ctx = makeCtx()
    const skills = [{ kind: 'agent-skill' as const, name: 'my-skill' }]
    const plugins = ['@anthropic/plugin-search']
    const projection = makeProjection({ skills, plugins })

    provideWorkspaceProjection(ctx, projection)
    const result = getWorkspaceProjection(ctx)
    expect(result.skills).toBe(skills)
    expect(result.plugins).toBe(plugins)
  })
})
