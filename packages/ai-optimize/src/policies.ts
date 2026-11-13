import { RETRIEVE_TOOL_NAME } from './retrieve-tool'
import type { FieldProjection, ToolContextPolicy } from '@tanstack/ai'
import type {
  OptimizeConfig,
  OptimizeFieldRule,
  ResolvedArgsPolicy,
  ResolvedFieldProjection,
  ResolvedResultPolicy,
} from './types'

const DEFAULT_ABOVE_TOKENS = 1500
const DEFAULT_MAX_TOKENS = 750

/** Minimal tool shape the resolver reads. */
export interface PolicyTool {
  name: string
  needsApproval?: boolean
  context?: ToolContextPolicy
}

function resolveAuthorField(fp: FieldProjection): ResolvedFieldProjection {
  return {
    truncate: fp.truncate,
    aboveTokens: fp.aboveTokens ?? DEFAULT_ABOVE_TOKENS,
    maxTokens: fp.maxTokens ?? DEFAULT_MAX_TOKENS,
    retrievable: fp.retrievable ?? true,
  }
}

function resolveFieldRule(rule: OptimizeFieldRule): ResolvedFieldProjection {
  const t = rule.truncate
  if (typeof t === 'string') {
    return { truncate: t, aboveTokens: DEFAULT_ABOVE_TOKENS, maxTokens: DEFAULT_MAX_TOKENS, retrievable: true }
  }
  return {
    truncate: t.strategy,
    aboveTokens: t.aboveTokens ?? DEFAULT_ABOVE_TOKENS,
    maxTokens: t.maxTokens ?? DEFAULT_MAX_TOKENS,
    retrievable: t.retrievable ?? true,
  }
}

/**
 * Policy resolution with the precedence of §5.4 (per tool, per field, first
 * match wins):
 *
 * 1. `optimize()` `exclude` — tool is never projected (beats everything).
 * 2. Author adornment (`tool.context`) — a field adorned by the author cannot
 *    be re-adorned or un-adorned by `optimize()` for that field.
 * 3. `optimize()` per-tool override (`tools.<name>.result.fields.<path>`, and
 *    `.args.fields.<path>` — args rules exist only here, per D3).
 * 4. `optimize()` universal `defaults` — result fields only.
 * 5. No rule → no projection.
 */
export class PolicyResolver {
  private readonly exclude: Set<string>
  private readonly config: OptimizeConfig

  constructor(config: OptimizeConfig = {}) {
    this.config = config
    this.exclude = new Set(config.exclude ?? [])
  }

  /** Resolve the result policy for a tool, or `undefined` for no projection. */
  result(tool: PolicyTool): ResolvedResultPolicy | undefined {
    // Retrieval results are always exempt (D4), even from universal defaults.
    if (tool.name === RETRIEVE_TOOL_NAME) return undefined
    if (this.exclude.has(tool.name)) return undefined

    const override = this.config.tools?.[tool.name]?.result
    const author = tool.context?.result

    // Per-field: override first, then author on top (author wins).
    const fields: Record<string, ResolvedFieldProjection> = {}
    if (override?.fields) {
      for (const [path, rule] of Object.entries(override.fields)) {
        fields[path] = resolveFieldRule(rule)
      }
    }
    if (author?.fields) {
      for (const [path, fp] of Object.entries(author.fields)) {
        fields[path] = resolveAuthorField(fp)
      }
    }

    const defaults = this.config.defaults
    const dflt = defaults
      ? {
          mode: defaults.mode ?? ('leaves' as const),
          projection: resolveFieldRule({ truncate: defaults.truncate }),
        }
      : undefined

    // No explicit fields and no universal default → nothing to project.
    if (Object.keys(fields).length === 0 && !dflt) return undefined

    const includeErrors = author?.includeErrors ?? override?.includeErrors ?? false
    return { fields, default: dflt, includeErrors }
  }

  /** Resolve the args policy for a tool. Args rules are `optimize()`-only (D3)
   *  and FORBIDDEN on `needsApproval` tools (their args are the approval
   *  surface — keep the history honest). */
  args(tool: PolicyTool): ResolvedArgsPolicy | undefined {
    if (tool.name === RETRIEVE_TOOL_NAME) return undefined
    if (this.exclude.has(tool.name)) return undefined
    if (tool.needsApproval) return undefined // forbidden in v1

    const override = this.config.tools?.[tool.name]?.args
    if (!override?.fields || Object.keys(override.fields).length === 0) return undefined

    const fields: Record<string, ResolvedFieldProjection> = {}
    for (const [path, rule] of Object.entries(override.fields)) {
      fields[path] = resolveFieldRule(rule)
    }
    return { fields }
  }

  /** True when any applicable (non-excluded) rule across the tool set is
   *  retrievable — i.e. `retrieve_context` should be injected. */
  anyRetrievable(tools: Array<PolicyTool>): boolean {
    for (const tool of tools) {
      const result = this.result(tool)
      if (result) {
        if (result.default?.projection.retrievable) return true
        for (const f of Object.values(result.fields)) if (f.retrievable) return true
      }
      const args = this.args(tool)
      if (args) for (const f of Object.values(args.fields)) if (f.retrievable) return true
    }
    return false
  }
}
