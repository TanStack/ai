/**
 * `load_skill` — activates a skill by name and returns its (frontmatter-stripped)
 * body plus a resource/script inventory. Result shape is frozen in phase 1;
 * changing it later would churn every eval, snapshot, and devtools panel.
 */
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { stripFrontmatter } from '../parse'
import type { Tool } from '@tanstack/ai'
import type {
  LoadSkillResult,
  SkillMetadata,
  SkillScriptRef,
  SkillSource,
} from '../types'

export const ALREADY_LOADED =
  '(already loaded earlier in this conversation — reuse the prior content)'

const scriptSchema = z.object({
  path: z.string(),
  executable: z.literal(false),
  reason: z.string().optional(),
})

const resultSchema = z.object({
  skill: z.string(),
  content: z.string(),
  resources: z.array(z.string()),
  scripts: z.array(scriptSchema),
  compatibility: z.string().optional(),
})

export interface LoadSkillDeps {
  source: SkillSource
  skills: Array<SkillMetadata>
  /** per-conversation activation set (dedupe). */
  activated: Set<string>
  requireApproval?: boolean
}

export function createLoadSkillTool(deps: LoadSkillDeps): Tool {
  const names = deps.skills.map((s) => s.name)
  const nameEnum = z.enum(names as [string, ...Array<string>])
  const byName = new Map(deps.skills.map((s) => [s.name, s]))

  const handler = async ({
    name,
  }: {
    name: string
  }): Promise<LoadSkillResult> => {
    if (deps.activated.has(name)) {
      return {
        skill: name,
        content: ALREADY_LOADED,
        resources: [],
        scripts: [],
      }
    }
    const raw = await deps.source.load(name)
    const resources = (await deps.source.listResources?.(name)) ?? []
    const scripts = ((await deps.source.listScripts?.(name)) ??
      []) as Array<SkillScriptRef>
    deps.activated.add(name)
    const compatibility = byName.get(name)?.compatibility
    return {
      skill: name,
      content: stripFrontmatter(raw),
      resources,
      scripts,
      ...(compatibility && { compatibility }),
    }
  }

  const description =
    'Activate an available skill by name. Returns its full instructions plus ' +
    'a list of any bundled resources and scripts.'
  const inputSchema = z.object({ name: nameEnum })

  if (deps.requireApproval) {
    return toolDefinition({
      name: 'load_skill',
      description,
      inputSchema,
      outputSchema: resultSchema,
      needsApproval: true,
      approvalSchema: z.object({ approve: z.boolean() }),
    }).server(handler)
  }
  return toolDefinition({
    name: 'load_skill',
    description,
    inputSchema,
    outputSchema: resultSchema,
  }).server(handler)
}
