/**
 * Artifact tools (Draft 0.2 §8.1), agent-facing. Tool *definitions* (name,
 * description, JSON-Schema parameters) for the model, plus a handler factory
 * that composes a store (§3) and an injected builder (§7.3.3) into working
 * create/revise/read/list/render operations.
 *
 * `list_artifacts` before `create_artifact` is a spec-level nudge: reuse is
 * cheaper than regeneration (§8.1).
 */

import { hashContent } from './store'
import { describeRegistryForPrompt } from './registry'
import type { ArtifactStore } from './store'
import type {
  ArtifactBuilder,
  ArtifactRecord,
  ArtifactToolResult,
  CreateArtifactInput,
  ModuleRegistry,
  ReviseArtifactInput,
} from './types'

export interface ArtifactToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** The agent-facing tool definitions (§8.1). `registry` tailors the react-tsx guidance. */
export function getArtifactToolDefinitions(
  registry: ModuleRegistry,
): Array<ArtifactToolDefinition> {
  const kindDesc =
    'Authoring kind. "html-fragment": markup + optional <style>/<script>, no document skeleton (best for simple widgets and hand-tuned SVG domain figures). "react-tsx": one TSX module whose default export is a component. ' +
    describeRegistryForPrompt(registry)

  return [
    {
      name: 'create_artifact',
      description:
        'Create a persistent Frame-tier UI artifact (Open Generative UI Draft 0.2 Tier F). The artifact is stored, built (react-tsx), and can be embedded inline in your message with render_artifact. Prefer list_artifacts first to reuse an existing one. Numbers presented as computed should come from host-provided data, not model arithmetic.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'source', 'fallbackText'],
        properties: {
          kind: {
            type: 'string',
            enum: ['html-fragment', 'react-tsx'],
            description: kindDesc,
          },
          title: {
            type: 'string',
            description: 'Short human title for the artifact.',
          },
          source: {
            type: 'string',
            description:
              'The artifact source (fragment HTML or one TSX module with a default-export component).',
          },
          fallbackText: {
            type: 'string',
            description:
              'REQUIRED plain-text description for text-only surfaces, errors, and accessibility.',
          },
          data: {
            description:
              'Optional JSON data passed to the artifact (props.data for react-tsx, host.init.data for fragments). Put authoritative numbers here.',
          },
          dataSource: {
            type: 'object',
            additionalProperties: false,
            required: ['name'],
            properties: {
              name: {
                type: 'string',
                description:
                  'Name of a host live data source (see the list in the system prompt). The host streams values into this artifact in real time.',
              },
              params: {
                type: 'object',
                description: 'Optional params for the source.',
              },
            },
            description:
              'Optional: bind this artifact to a host live data source so it updates in real time. Read the streamed value with useHostData() (react-tsx) or window.__ogui.onData (html-fragment). IMPORTANT: useHostData() returns undefined until the first value arrives — ALWAYS default it before use, e.g. `const d = useHostData() || { total: 0, recent: [] }`, and never destructure or call methods on the raw result. Use ONLY source names listed in the system prompt.',
          },
          scope: {
            type: 'string',
            enum: ['private', 'pod', 'public-link'],
            description: 'Sharing scope. Defaults to private.',
          },
          networkGrants: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional connect-src domains to request; the host grants a subset.',
          },
        },
      },
    },
    {
      name: 'revise_artifact',
      description:
        'Produce a new immutable revision of an existing artifact from new source. Returns the new pinned revision or structured build errors.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['artifactId', 'source'],
        properties: {
          artifactId: { type: 'string' },
          source: {
            type: 'string',
            description: 'The full new source for the next revision.',
          },
          note: {
            type: 'string',
            description: 'Optional note describing the change.',
          },
        },
      },
    },
    {
      name: 'read_artifact',
      description:
        'Read an artifact source + metadata (to inform a revision). Latest revision unless one is given.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['artifactId'],
        properties: {
          artifactId: { type: 'string' },
          revision: { type: 'number' },
        },
      },
    },
    {
      name: 'list_artifacts',
      description:
        'List library artifacts for reuse instead of regenerating. Optionally filter by scope or title query.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          scope: { type: 'string', enum: ['private', 'pod', 'public-link'] },
          query: { type: 'string' },
        },
      },
    },
    {
      name: 'render_artifact',
      description:
        'Embed a pinned artifact revision inline in the current message.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['artifactId', 'revision'],
        properties: {
          artifactId: { type: 'string' },
          revision: { type: 'number' },
        },
      },
    },
  ]
}

export interface ArtifactToolContext {
  store: ArtifactStore
  builder: ArtifactBuilder
  registry: ModuleRegistry
  /** Base app URL for the standalone artifact page (§4.1), e.g. "" or "http://host". */
  baseUrl?: string
  ownerId?: string
  channelId?: string
  provenance?: Partial<ArtifactRecord['provenance']>
  /** Injected for determinism in tests. */
  now?: () => string
  genId?: () => string
}

let idSeq = 0
function defaultGenId(): string {
  idSeq += 1
  // Monotonic, collision-resistant enough for a single process.
  return `art_${Date.now().toString(36)}${idSeq.toString(36).padStart(2, '0')}`
}

/**
 * The create/revise/read/list/render handlers over a store + builder (§8.1).
 * Build failures become structured tool results (§7.3.3), not thrown errors,
 * so the compile loop stays in the agent conversation.
 */
export function createArtifactTools(ctx: ArtifactToolContext) {
  const now = ctx.now ?? (() => new Date().toISOString())
  const genId = ctx.genId ?? defaultGenId
  const baseUrl = ctx.baseUrl ?? ''
  const pageUrl = (artifactId: string) => `${baseUrl}/a/${artifactId}`

  async function buildAndRecord(partial: {
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
    const build = await ctx.builder.build({
      kind: partial.kind,
      source: partial.source,
      registry: ctx.registry,
    })
    if (!build.ok) {
      return {
        error: 'build-failed',
        buildLog: build.buildLog,
        diagnostics: build.diagnostics ?? [],
      }
    }

    let builtRef: string | undefined
    if (partial.kind === 'react-tsx' && build.code) {
      const bundleHash = hashContent(build.code)
      ctx.store.blobs.put(bundleHash, build.code)
      builtRef = `store://assets/${bundleHash}`
    }

    const registryVersion =
      partial.kind === 'react-tsx' ? ctx.registry.version : undefined
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
      ownership: {
        ownerId: ctx.ownerId ?? 'anon',
        scope: partial.scope,
        channelId: ctx.channelId,
      },
      trustTier: 'untrusted',
      createdAt: now(),
      supersedes: partial.supersedes,
    }
    ctx.store.save(record)
    return {
      artifactId: record.artifactId,
      revision: record.revision,
      url: pageUrl(record.artifactId),
    }
  }

  return {
    async create(input: CreateArtifactInput): Promise<ArtifactToolResult> {
      return buildAndRecord({
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
      const prev = ctx.store.latest(input.artifactId)
      if (!prev)
        return {
          error: 'build-failed',
          buildLog: `Unknown artifact ${input.artifactId}`,
          diagnostics: [],
        }
      return buildAndRecord({
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

    read(input: {
      artifactId: string
      revision?: number
    }): ArtifactRecord | undefined {
      return ctx.store.get(input.artifactId, input.revision)
    },

    list(
      input: {
        scope?: ArtifactRecord['ownership']['scope']
        query?: string
      } = {},
    ): Array<ArtifactRecord> {
      return ctx.store.list({ scope: input.scope, query: input.query })
    },

    render(input: {
      artifactId: string
      revision: number
    }): ArtifactRecord | undefined {
      return ctx.store.get(input.artifactId, input.revision)
    },
  }
}

export type ArtifactTools = ReturnType<typeof createArtifactTools>
