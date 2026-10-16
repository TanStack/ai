/**
 * `generativeUiArtifacts()` — a TanStack AI `ChatMiddleware` that injects the
 * Frame-tier artifact tools (Draft 0.2 §8.1) into a `chat()` call. The host
 * supplies the storage + build primitives; the middleware wires them into
 * server-executed tools the model can call during the conversation:
 *
 *   create_artifact · revise_artifact · list_artifacts · read_artifact
 *
 * On a successful create/revise it emits a `genui:artifact` custom event
 * carrying the pin `{artifactId, revision}` so the client renders the frame
 * inline (§11, inline-first). Build failures come back as the tool RESULT
 * (structured diagnostics), so the model self-corrects inside the agent loop —
 * the §7.3.3 compile loop, made real.
 */

import { toolDefinition } from '@tanstack/ai'
import type { ChatMiddleware } from '@tanstack/ai'
import { getArtifactToolDefinitions } from '../frame/tools'
import { REFERENCE_REGISTRY } from '../frame/registry'
import { createFrameArtifacts } from './operations'
import type { FrameArtifactsContext } from './operations'
import { artifactResourceUri, MCP_APP_MIME_TYPE } from './resource-uri'
import type { ArtifactRecord, ArtifactToolResult, CreateArtifactInput, ReviseArtifactInput } from '../frame/types'

export interface GenerativeUiArtifactsOptions extends FrameArtifactsContext {
  /**
   * Emit a `genui:artifact` custom event on create/revise so our own client
   * renders the frame inline. Default `true`.
   */
  emitPins?: boolean
  /** Custom-event name for the pin. Default `'genui:artifact'`. */
  pinEventName?: string
  /**
   * Also emit a standard MCP Apps (SEP-1865) `ui-resource` part on create/revise,
   * so a host renders the artifact through the same path as external MCP widgets
   * (`UIResourceEvent` → `UIResourcePart` → `MCPAppResource`). Additive: the pin
   * event still fires unless disabled.
   *
   * Requires `renderShell` to produce the self-contained HTML. Only emitted for
   * `html-fragment` (react-tsx needs a serving origin — see the MCP server
   * adapter); set `includeReactTsx` to override.
   */
  emitUiResource?: boolean
  /** Build the self-contained shell HTML for an artifact record (host-provided). */
  renderShell?: (record: ArtifactRecord) => string
  /** Emit `ui-resource` for react-tsx too (only when `renderShell` yields a self-contained doc). */
  includeReactTsx?: boolean
}

// Tool args arrive from JSON Schema (untyped at the boundary) — `any` at the
// call sites below is deliberate; shapes are validated by the model + store.

/**
 * Build the artifact middleware. Idempotent: it only injects a tool whose name
 * isn't already present on the request (so it composes with a host that already
 * declares some of these).
 */
export function generativeUiArtifacts(options: GenerativeUiArtifactsOptions): ChatMiddleware {
  const registry = options.registry ?? REFERENCE_REGISTRY
  const ops = createFrameArtifacts({ ...options, registry })
  const emitPins = options.emitPins !== false
  const pinEvent = options.pinEventName ?? 'genui:artifact'
  const emitUiResource = options.emitUiResource === true

  const defs = getArtifactToolDefinitions(registry)
  const descOf = (name: string) => defs.find((d) => d.name === name)?.description ?? name
  const schemaOf = (name: string) => defs.find((d) => d.name === name)?.parameters ?? { type: 'object' }

  async function emitPin(ctx: any, res: ArtifactToolResult): Promise<void> {
    if ('error' in res) return
    const rec = await ops.read({ artifactId: res.artifactId, revision: res.revision })

    if (emitPins) {
      ctx?.emitCustomEvent?.(pinEvent, {
        pin: { artifactId: res.artifactId, revision: res.revision },
        title: rec?.title,
        kind: rec?.kind,
        url: res.url,
      })
    }

    // Standard MCP Apps path: emit a `ui-resource` part the SDK reconciles into
    // a UIResourcePart (toolCallId is stamped downstream from the tool context).
    if (emitUiResource && rec && options.renderShell) {
      const portable = rec.kind === 'html-fragment' || options.includeReactTsx === true
      if (portable) {
        ctx?.emitCustomEvent?.('ui-resource', {
          resource: {
            uri: artifactResourceUri(rec.artifactId, rec.revision),
            mimeType: MCP_APP_MIME_TYPE,
            text: options.renderShell(rec),
          },
          toolName: 'create_artifact',
        })
      }
    }
  }

  const createTool = toolDefinition({
    name: 'create_artifact',
    description: descOf('create_artifact'),
    inputSchema: schemaOf('create_artifact'),
  }).server(async (args: any, ctx: any) => {
    const res = await ops.create(args as CreateArtifactInput)
    await emitPin(ctx, res)
    return res
  })

  const reviseTool = toolDefinition({
    name: 'revise_artifact',
    description: descOf('revise_artifact'),
    inputSchema: schemaOf('revise_artifact'),
  }).server(async (args: any, ctx: any) => {
    const res = await ops.revise(args as ReviseArtifactInput)
    await emitPin(ctx, res)
    return res
  })

  const listTool = toolDefinition({
    name: 'list_artifacts',
    description: descOf('list_artifacts'),
    inputSchema: schemaOf('list_artifacts'),
  }).server(async (args: any) => {
    const recs = await ops.list(args ?? {})
    return recs.map((r) => ({ artifactId: r.artifactId, revision: r.revision, title: r.title, kind: r.kind }))
  })

  const readTool = toolDefinition({
    name: 'read_artifact',
    description: descOf('read_artifact'),
    inputSchema: schemaOf('read_artifact'),
  }).server(async (args: any) => {
    const rec = await ops.read(args)
    if (!rec) return { error: 'not-found' as const }
    return {
      artifactId: rec.artifactId,
      revision: rec.revision,
      kind: rec.kind,
      title: rec.title,
      source: rec.source,
      registryVersion: rec.registryVersion,
    }
  })

  const injected = [createTool, reviseTool, listTool, readTool]

  return {
    name: 'generative-ui-artifacts',
    onConfig(_ctx, config) {
      const present = new Set(config.tools.map((t: any) => t.name))
      const add = injected.filter((t: any) => !present.has(t.name))
      if (add.length === 0) return
      return { tools: [...config.tools, ...add] }
    },
  }
}
