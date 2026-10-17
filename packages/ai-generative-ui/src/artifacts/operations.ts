/**
 * Async artifact operations (Draft 0.2 §8.1) over a {@link FrameArtifactStore}
 * and an injected {@link ArtifactBuilder}. The build→record→save pipeline the
 * middleware tools call, and the example's fixture seeding reuses. Build
 * failures are returned as structured results (§7.3.3), never thrown.
 */

import { hashContent } from '../frame/store'
import { REFERENCE_REGISTRY } from '../frame/registry'
import type { FrameArtifactStore } from './store'
import type {
  ArtifactBuilder,
  ArtifactRecord,
  ArtifactToolResult,
  CreateArtifactInput,
  ModuleRegistry,
  ReviseArtifactInput,
} from '../frame/types'

export interface FrameArtifactsContext {
  store: FrameArtifactStore
  builder: ArtifactBuilder
  registry?: ModuleRegistry
  /** Base app URL for the standalone artifact page (§4.1). */
  baseUrl?: string
  ownerId?: string
  channelId?: string
  provenance?: Partial<ArtifactRecord['provenance']>
  now?: () => string
  genId?: () => string
}

let idSeq = 0
function defaultGenId(): string {
  idSeq += 1
  return `art_${Date.now().toString(36)}${idSeq.toString(36).padStart(2, '0')}`
}

/**
 * Build the create/revise/read/list operations. Returned `create`/`revise`
 * resolve to `{ artifactId, revision, url }` or a structured build error.
 */
export function createFrameArtifacts(ctx: FrameArtifactsContext) {
  const registry = ctx.registry ?? REFERENCE_REGISTRY
  const now = ctx.now ?? (() => new Date().toISOString())
  const genId = ctx.genId ?? defaultGenId
  const baseUrl = ctx.baseUrl ?? ''
  const pageUrl = (artifactId: string) => `${baseUrl}/a/${artifactId}`

  async function buildAndSave(partial: {
    artifactId: string
    revision: number
    supersedes?: number
    kind: ArtifactRecord['kind']
    title: string
    fallbackText: string
    source: string
    scope: ArtifactRecord['ownership']['scope']
    networkGrants?: Array<string>
    data?: unknown
    dataSource?: ArtifactRecord['dataSource']
  }): Promise<ArtifactToolResult> {
    const build = await ctx.builder.build({ kind: partial.kind, source: partial.source, registry })
    if (!build.ok) {
      return { error: 'build-failed', buildLog: build.buildLog, diagnostics: build.diagnostics ?? [] }
    }

    let builtRef: string | undefined
    let builtCode: string | undefined
    if (partial.kind === 'react-tsx' && build.code) {
      builtCode = build.code
      builtRef = `store://assets/${hashContent(build.code)}`
    }

    const registryVersion = partial.kind === 'react-tsx' ? registry.version : undefined
    const record: ArtifactRecord = {
      artifactId: partial.artifactId,
      revision: partial.revision,
      contentHash: hashContent(partial.source, registryVersion ?? ''),
      kind: partial.kind,
      title: partial.title,
      fallbackText: partial.fallbackText,
      source: partial.source,
      builtRef,
      buildLog: build.buildLog,
      registryVersion,
      networkGrants: partial.networkGrants,
      data: partial.data,
      dataSource: partial.dataSource,
      provenance: { driver: 'live', ...ctx.provenance },
      ownership: { ownerId: ctx.ownerId ?? 'anon', scope: partial.scope, channelId: ctx.channelId },
      trustTier: 'untrusted',
      createdAt: now(),
      supersedes: partial.supersedes,
    }
    await ctx.store.save(record, builtCode)
    return { artifactId: record.artifactId, revision: record.revision, url: pageUrl(record.artifactId) }
  }

  return {
    create(input: CreateArtifactInput): Promise<ArtifactToolResult> {
      return buildAndSave({
        artifactId: genId(),
        revision: 1,
        kind: input.kind,
        title: input.title,
        fallbackText: input.fallbackText,
        source: input.source,
        scope: input.scope ?? 'private',
        networkGrants: input.networkGrants,
        data: input.data,
        dataSource: input.dataSource,
      })
    },

    async revise(input: ReviseArtifactInput): Promise<ArtifactToolResult> {
      const prev = await ctx.store.latest(input.artifactId)
      if (!prev) return { error: 'build-failed', buildLog: `Unknown artifact ${input.artifactId}`, diagnostics: [] }
      return buildAndSave({
        artifactId: prev.artifactId,
        revision: prev.revision + 1,
        supersedes: prev.revision,
        kind: prev.kind,
        title: prev.title,
        fallbackText: prev.fallbackText,
        source: input.source,
        scope: prev.ownership.scope,
        networkGrants: prev.networkGrants,
        data: prev.data,
        dataSource: prev.dataSource,
      })
    },

    read(input: { artifactId: string; revision?: number }): Promise<ArtifactRecord | undefined> {
      return ctx.store.get(input.artifactId, input.revision)
    },

    list(input: { scope?: ArtifactRecord['ownership']['scope']; query?: string } = {}): Promise<Array<ArtifactRecord>> {
      return ctx.store.list({ scope: input.scope, query: input.query })
    },
  }
}

export type FrameArtifacts = ReturnType<typeof createFrameArtifacts>
