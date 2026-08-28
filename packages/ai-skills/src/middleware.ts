/**
 * `withSkills` — portable Agent Skills as a chat middleware.
 *
 * All source resolution and catalog rendering happen once in `setup`; `onConfig`
 * (which fires every agent iteration) only returns memoized values. Otherwise an
 * S3-backed source would hit the network per loop turn and catalog reordering
 * would break Anthropic's cache prefix mid-run.
 */
import {
  createCapability,
  defineChatMiddleware,
  SkillLimitError,
} from '@tanstack/ai'
import { combineSources } from './combinators'
import { renderCatalog } from './catalog'
import { modelFamilyOf } from './types'
import { createLoadSkillTool } from './tools/load-skill'
import { READ_RESOURCE_TOOL_NAME } from './tools/read-resource'
import type { DefinedChatMiddleware, StreamChunk, Tool } from '@tanstack/ai'
import type { ModelFamily, SkillMetadata, SkillSource } from './types'

/** CUSTOM stream-event name carrying the catalog to the browser DevTools. */
export const SKILLS_STATE_EVENT = 'skills:state'

export interface SkillsStateEventValue {
  catalog: Array<{ name: string; description: string }>
  activated: Array<string>
}

export interface SkillsOptions {
  /** Override catalog rendering. Receives resolved metadata + the model family. */
  renderCatalog?: (skills: Array<SkillMetadata>, family: ModelFamily) => string
  /** Template with a required `{skills}` placeholder. Literal braces escape as `{{`/`}}`. */
  instructionTemplate?: string
  /** Hard cap on tier-1 catalog token spend. Default 4000. */
  maxCatalogTokens?: number
  /** `'error'` (default) or a reducer invoked when the cap is exceeded. */
  onLimitExceeded?:
    | 'error'
    | ((skills: Array<SkillMetadata>, limit: number) => Array<SkillMetadata>)
  /** Where the catalog goes. Default `'system'`. */
  catalogPlacement?: 'system' | 'tool-description'
  /** Require approval before load_skill / read_skill_resource. Default false. */
  requireApproval?: boolean
}

interface SkillsRuntime {
  skills: Array<SkillMetadata>
  activated: Set<string>
  source: SkillSource
  family: ModelFamily
  catalog: string
  options: SkillsOptions
  /** Built on first onConfig (needs config.tools to detect the resource tool). */
  memo?: { prompt: { content: string } | undefined; tools: Array<Tool> }
  stateChunkEmitted?: boolean
}

const SkillsCapability = createCapability<SkillsRuntime>()('skills')

/** ~4 chars/token — good enough to guard a runaway catalog. */
const estimateTokens = (s: string) => Math.ceil(s.length / 4)

function fillTemplate(template: string, catalog: string): string {
  // Escape `{{`/`}}` to sentinels, substitute `{skills}`, then restore braces.
  const OPEN = '\u0000OPEN\u0000'
  const CLOSE = '\u0000CLOSE\u0000'
  return template
    .split('{{')
    .join(OPEN)
    .split('}}')
    .join(CLOSE)
    .split('{skills}')
    .join(catalog)
    .split(OPEN)
    .join('{')
    .split(CLOSE)
    .join('}')
}

/** True when a code_execution/shell tool in `tools` carries hosted skills. */
function findNativeSkillTool(tools: Array<Tool>): string | undefined {
  for (const tool of tools) {
    const meta = tool.metadata as
      | { skills?: Array<unknown>; environment?: { skills?: Array<unknown> } }
      | undefined
    if (tool.name === 'code_execution' && (meta?.skills?.length ?? 0) > 0) {
      return 'code_execution'
    }
    if (tool.name === 'shell' && (meta?.environment?.skills?.length ?? 0) > 0) {
      return 'shell'
    }
  }
  return undefined
}

function activationInstructions(
  catalog: string,
  hasResourceTool: boolean,
): string {
  const resourceLine = hasResourceTool
    ? 'To read a skill’s bundled resource files, call `read_skill_resource` with the skill name and the resource path.'
    : 'Some skills may list resource files; they are not loadable in this configuration.'
  return [
    'You have access to a library of skills. When a task matches one, call the `load_skill` tool with its name to load its full instructions before proceeding.',
    catalog,
    resourceLine,
  ].join('\n\n')
}

export function withSkills(
  sources: SkillSource | Array<SkillSource>,
  options: SkillsOptions = {},
): DefinedChatMiddleware<
  unknown,
  readonly [],
  readonly [typeof SkillsCapability]
> {
  if (options.instructionTemplate && options.renderCatalog) {
    throw new Error(
      '`instructionTemplate` and `renderCatalog` are mutually exclusive',
    )
  }
  if (
    options.instructionTemplate &&
    !options.instructionTemplate.includes('{skills}')
  ) {
    throw new Error(
      '`instructionTemplate` must contain a `{skills}` placeholder',
    )
  }

  return defineChatMiddleware({
    name: 'skills',
    provides: [SkillsCapability],

    async setup(ctx) {
      const source = combineSources(sources)
      let skills = await source.list()
      const family = modelFamilyOf(ctx.provider)

      // Catalog token cap (spec §4.2).
      const limit = options.maxCatalogTokens ?? 4000
      const render = options.renderCatalog ?? renderCatalog
      let catalog = render(skills, family)
      if (estimateTokens(catalog) > limit) {
        if (options.onLimitExceeded && options.onLimitExceeded !== 'error') {
          skills = options.onLimitExceeded(skills, limit)
          catalog = render(skills, family)
        }
        if (estimateTokens(catalog) > limit) {
          throw new SkillLimitError({
            provider: family,
            path: 'portable',
            limit: `maxCatalogTokens (${limit})`,
            allowed: limit,
            actual: estimateTokens(catalog),
            offending: skills.map((s) => s.name),
          })
        }
      }

      ctx.provide(SkillsCapability, {
        skills,
        activated: new Set<string>(),
        source,
        family,
        catalog,
        options,
      })
    },

    onConfig(ctx, config) {
      const rt = ctx.get(SkillsCapability)
      if (rt.skills.length === 0) return // empty catalog → no tools, no prompt

      // Native co-existence: portable + hosted skills don't compose (spec §6.1).
      const native = findNativeSkillTool(config.tools)
      if (native) {
        throw new Error(
          `withSkills (portable skills) cannot be combined with a "${native}" tool that carries hosted/native skills. ` +
            'Use one delivery mode: remove the hosted skills, or drop withSkills.',
        )
      }

      if (!rt.memo) {
        const hasResourceTool = config.tools.some(
          (t) => t.name === READ_RESOURCE_TOOL_NAME,
        )
        const body =
          options.instructionTemplate !== undefined
            ? fillTemplate(options.instructionTemplate, rt.catalog)
            : activationInstructions(rt.catalog, hasResourceTool)

        const loadTool = createLoadSkillTool({
          source: rt.source,
          skills: rt.skills,
          activated: rt.activated,
          requireApproval: options.requireApproval,
        })

        const placement = options.catalogPlacement ?? 'system'
        if (placement === 'tool-description') {
          loadTool.description = `${loadTool.description}\n\n${body}`
          rt.memo = { prompt: undefined, tools: [loadTool] }
        } else {
          rt.memo = { prompt: { content: body }, tools: [loadTool] }
        }
      }

      // onConfig fires every iteration and the engine feeds the merged config
      // back in — so appending must be idempotent (add our prompt/tools only
      // when not already present) or a second iteration duplicates them.
      const prompt = rt.memo.prompt
      const promptPresent =
        !prompt ||
        config.systemPrompts.some((p) =>
          typeof p === 'string'
            ? p === prompt.content
            : p.content === prompt.content,
        )
      const existingNames = new Set(config.tools.map((t) => t.name))
      const toolsToAdd = rt.memo.tools.filter((t) => !existingNames.has(t.name))

      return {
        systemPrompts:
          prompt && !promptPresent
            ? [...config.systemPrompts, prompt]
            : config.systemPrompts,
        tools:
          toolsToAdd.length > 0
            ? [...config.tools, ...toolsToAdd]
            : config.tools,
      }
    },

    onChunk(ctx, chunk) {
      const rt = ctx.getOptional(SkillsCapability)
      if (!rt || rt.stateChunkEmitted) return
      rt.stateChunkEmitted = true
      const custom: StreamChunk = {
        type: 'CUSTOM',
        name: SKILLS_STATE_EVENT,
        value: {
          catalog: rt.skills.map((s) => ({
            name: s.name,
            description: s.description,
          })),
          activated: [...rt.activated],
        } satisfies SkillsStateEventValue,
        timestamp: Date.now(),
      }
      return [chunk, custom]
    },
  })
}
