import { defineAgent, maxIterations } from '@tanstack/ai'
import { defineCommand } from '../commands'
import { configOption } from '../config'
import { definePlugin } from '../plugins'
import { readMarkdownFiles } from './files'
import { globToRegExp } from './glob'
import { PermissionRules } from './permissions'
import type {
  AnyTextAdapter,
  AnyTool,
  ChatMiddleware,
  ChatMiddlewareConfig,
  KeyedAdapter,
} from '@tanstack/ai'
import type { FrontmatterValue } from './files'
import type { PermissionRule } from './permissions'

/** A named agent: its prompt, tools, model, rules, and step limit. */
export interface AgentProfile {
  name: string
  /** What the agent does. The model reads it to pick a subagent. */
  description: string
  /**
   * - `primary`: it answers the user's turns. Pick it with `/agent`.
   * - `subagent`: the main model starts it with the `subagent` tool.
   * - `all`: both.
   */
  mode: 'primary' | 'subagent' | 'all'
  /**
   * A model id. `agents({ adapter })` turns it into an adapter. Without it,
   * a primary agent keeps the harness model, and a subagent uses the model
   * of the main turn.
   */
  model?: string
  /** System prompt text added to each turn of this agent. */
  system?: string
  /**
   * The tools this agent can call, by name. A `*` matches any text, for
   * example `todo_*`. Without it, the agent gets every tool.
   */
  tools?: ReadonlyArray<string>
  /**
   * Permission rules that count while this agent is the primary agent.
   * `permissions()` reads them. They do not apply in a subagent run.
   */
  permissions?: ReadonlyArray<PermissionRule>
  /**
   * The most model calls with tools in one run. The next call gets no tool
   * calls and a note to answer now, and then the run stops.
   */
  steps?: number
  /**
   * Leave it out of the `/agent` list and the `agent` setting. The model
   * can still start it as a subagent.
   */
  hidden?: boolean
}

/** The tools that only read: files, search, the web, and questions. */
const READ_TOOLS = [
  'read_file',
  'list_files',
  'grep',
  'webfetch',
  'websearch',
  'question',
]

/** The built-in agents: `build`, `plan`, `general`, and `explore`. */
export const builtInAgents: ReadonlyArray<AgentProfile> = [
  {
    name: 'build',
    description: 'Does the work: reads code, changes files, and runs commands.',
    mode: 'primary',
    system:
      'You are the build agent. Do the task the user gives you. Read the code you need, change files, and run commands. Check your work before you say it is done.',
  },
  {
    name: 'plan',
    description: 'Reads the code and makes a plan. Does not change files.',
    mode: 'primary',
    tools: [...READ_TOOLS, 'todo_write'],
    system:
      'You are the plan agent. You can only read and search. Do not change files or run commands. Study the code, then give the user a clear plan in numbered steps.',
  },
  {
    name: 'general',
    description:
      'Does a research or work task in many steps and reports back. Give it the full task.',
    mode: 'subagent',
    system:
      'You are a general agent. Do the task you get in as many steps as it needs. Use your tools to search, read, and act. At the end, reply with a short report of what you found or did.',
  },
  {
    name: 'explore',
    description:
      'Searches the code fast and reports what it finds. Read-only. Give it a question.',
    mode: 'subagent',
    tools: READ_TOOLS,
    system:
      'You are a fast search agent. Find the files and code that answer the question you get. Only read and search. Reply with the paths and a short note for each.',
  },
]

const MODES = ['primary', 'subagent', 'all'] as const

const MAX_STEPS_PROMPT =
  'You reached the step limit. Do not call more tools. Answer now with what you have, and say what is left to do.'

const MAX_STEPS_RESULT = 'Step limit reached. Answer without calling tools.'

/** The tools whose name matches one of `patterns`. Without patterns, all of them. */
function allowedTools<TTool extends { name: string }>(
  tools: ReadonlyArray<TTool>,
  patterns: ReadonlyArray<string> | undefined,
) {
  if (patterns === undefined) return [...tools]
  const matchers = patterns.map((pattern) => globToRegExp(pattern))
  return tools.filter((tool) =>
    matchers.some((matcher) => matcher.test(tool.name)),
  )
}

/**
 * Apply a profile to each model call of a chat run: keep only its tools,
 * and at its step limit, make one last call with no tool calls.
 */
function profileMiddleware(current: () => AgentProfile) {
  const isLastStep = (iteration: number) => {
    const { steps } = current()
    return steps !== undefined && iteration >= steps
  }
  const middleware: ChatMiddleware = {
    name: 'tanstack/agents',
    onConfig: (run, config) => {
      if (run.phase !== 'init' && run.phase !== 'beforeModel') return
      const { tools } = current()
      const update: Partial<ChatMiddlewareConfig> = {}
      if (tools !== undefined) update.tools = allowedTools(config.tools, tools)
      if (run.phase === 'beforeModel' && isLastStep(run.iteration)) {
        update.toolChoice = 'none'
        update.systemPrompts = [...config.systemPrompts, MAX_STEPS_PROMPT]
      }
      return update
    },
    // Some providers do not follow `toolChoice: 'none'`. Bedrock Converse
    // sends it as `auto` after tool calls. So refuse a call of the last step
    // here. In the tool phase, `iteration` is still the one of that call.
    onBeforeToolCall: (run) =>
      isLastStep(run.iteration)
        ? { type: 'skip', result: { error: MAX_STEPS_RESULT } }
        : undefined,
    // After the last call, stop. The harness loop limit still applies.
    onShouldContinue: (_run, state) => {
      const { steps } = current()
      return steps === undefined || state.iterationCount <= steps
    },
  }
  return middleware
}

/** A profile from a Markdown file. The body is its system prompt. */
function profileOfFile(file: {
  name: string
  fields: Record<string, FrontmatterValue>
  body: string
}) {
  const text = (key: string) => {
    const value = file.fields[key]
    return typeof value === 'string' && value !== '' ? value : undefined
  }
  const fail = (key: string) => {
    throw new Error(`Agent file ${file.name}.md: "${key}" is not valid.`)
  }
  const modeText = text('mode')
  const mode =
    modeText === undefined
      ? 'all'
      : (MODES.find((candidate) => candidate === modeText) ?? fail('mode'))
  const stepsText = text('steps')
  const steps = stepsText === undefined ? undefined : Number(stepsText)
  if (steps !== undefined && !(Number.isInteger(steps) && steps >= 0)) {
    fail('steps')
  }
  const model = text('model')
  const { tools } = file.fields
  const system = file.body.trim()
  // ponytail: no `permissions` from files, the parser reads no nested values
  const profile: AgentProfile = {
    name: file.name,
    description: text('description') ?? `The ${file.name} agent`,
    mode,
    ...(model !== undefined && { model }),
    ...(system !== '' && { system }),
    ...(tools !== undefined && {
      tools: typeof tools === 'string' ? [tools] : tools,
    }),
    ...(steps !== undefined && { steps }),
    ...(text('hidden') === 'true' && { hidden: true }),
  }
  return profile
}

/**
 * Named agents, each with its own system prompt, tools, model, permission
 * rules, and step limit.
 *
 * - A primary agent answers the user's turns. Switch it with
 *   `/agent <name>` or the `agent` setting. It applies at the next turn.
 * - A subagent is a child that the main model starts with the `subagent`
 *   tool. For one `subagent` tool, give the harness
 *   `subagents: { agents: [], tool: 'single' }`.
 *
 * The built-in agents are `build` (primary, the default, every tool),
 * `plan` (primary, read-only tools), `general` (subagent, every tool), and
 * `explore` (subagent, read-only tools). See {@link builtInAgents}.
 *
 * @param options.adapter - Turns a model id into an adapter: the `model` of
 *   a profile, or for a subagent without one, the model id of the main turn.
 *   A `keyedAdapter(...)` is built with the user's key.
 * @param options.agents - More profiles. A profile replaces an earlier one
 *   with the same name: built-ins first, then `dirs`, then `agents`.
 * @param options.dirs - Folders of `*.md` agent files. The file name is the
 *   agent name and the body is its system prompt. The frontmatter sets
 *   `description`, `mode` (default `all`), `model`, `tools` (a list),
 *   `steps`, and `hidden`.
 * @param options.builtIns - `false` drops the built-in agents.
 * @param options.default - The primary agent of a new session. Default: the
 *   first primary agent, `build` with the built-ins.
 *
 * @example
 * ```ts
 * const models: Record<string, AnyTextAdapter> = {
 *   'claude-sonnet-4-5': anthropicText('claude-sonnet-4-5'),
 * }
 * agents({
 *   adapter: (model) => models[model] ?? openaiText('gpt-5.5'),
 *   dirs: ['.agents/agents'],
 * })
 * ```
 */
export function agents(options: {
  adapter: (model: string) => AnyTextAdapter | KeyedAdapter<AnyTextAdapter>
  agents?: ReadonlyArray<AgentProfile>
  dirs?: ReadonlyArray<string>
  builtIns?: boolean
  default?: string
}) {
  return definePlugin({
    name: 'tanstack/agents',
    setup: async (ctx) => {
      const dirs = options.dirs ?? []
      const files = (await Promise.all(dirs.map(readMarkdownFiles))).flat()
      const all = [
        ...(options.builtIns === false ? [] : builtInAgents),
        ...files.map(profileOfFile),
        ...(options.agents ?? []),
      ]
      // A later profile replaces an earlier one and keeps its place.
      const profiles = [
        ...new Map(all.map((profile) => [profile.name, profile])).values(),
      ]
      const visible = profiles.filter(
        (profile) => profile.mode !== 'subagent' && !profile.hidden,
      )
      const names = visible.map((profile) => profile.name)
      const first = visible.find(
        (profile) => profile.name === (options.default ?? names[0]),
      )
      if (!first) {
        throw new Error(
          'agents(): `default` must name a primary agent that is not hidden.',
        )
      }
      const active = () => {
        const name = ctx.config.get('agent')
        return visible.find((profile) => profile.name === name) ?? first
      }
      // The tools and the model id of the last main turn. Subagents use them.
      // ponytail: a subagent started before any turn has no tools and needs a `model`
      let lead: { tools: ReadonlyArray<AnyTool>; model: string } | undefined

      const subagentOf = (profile: AgentProfile) =>
        defineAgent({
          name: profile.name,
          description: profile.description,
          run: async (child) => {
            const model = profile.model ?? lead?.model
            if (model === undefined) {
              throw new Error(
                `Agent ${profile.name} has no model. Give it a model, or start it from a turn.`,
              )
            }
            return child.chat({
              adapter: await child.keys.adapter(options.adapter(model)),
              tools: allowedTools(lead?.tools ?? [], profile.tools),
              systemPrompts:
                profile.system === undefined ? [] : [profile.system],
              middleware: [profileMiddleware(() => profile)],
              // The harness main loop has the same limit. chat() alone stops at 5 calls.
              agentLoopStrategy: maxIterations(50),
            })
          },
        })

      // A profile's rules count only while it is the primary agent. At other
      // times the getter gives a tool name that matches no tool.
      // ponytail: subagent runs get no profile rules, that needs the run in PermissionRules
      const rules = profiles.flatMap((profile) =>
        (profile.permissions ?? []).map((rule) =>
          PermissionRules.item({
            ...rule,
            get tool() {
              return active().name === profile.name ? rule.tool : ''
            },
          }),
        ),
      )

      return {
        config: {
          agent: configOption.select({
            options: names,
            default: first.name,
            description: 'The primary agent',
          }),
        },
        commands: {
          agent: defineCommand({
            description: `Show or switch the primary agent (${names.join(', ')})`,
            run: async (input: unknown) => {
              const name = typeof input === 'string' ? input.trim() : ''
              const list = `Agents: ${names.join(', ')}.`
              if (name === '') return `Agent: ${active().name}. ${list}`
              const receipt = await ctx.session.setConfig('agent', name)
              return receipt.status === 'rejected'
                ? `Unknown agent "${name}". ${list}`
                : `Agent: ${name}. It applies at the next turn.`
            },
          }),
        },
        prompts: [
          { id: 'tanstack/agents:system', text: () => active().system ?? '' },
        ],
        adapter: () => {
          const { model } = active()
          return model === undefined ? undefined : options.adapter(model)
        },
        prepareTools: ({ tools, model }) => {
          lead = { tools, model }
          return tools
        },
        // In onConfig, so the `subagent` tool that chat() adds is filtered too.
        middleware: [profileMiddleware(active)],
        subagents: profiles
          .filter((profile) => profile.mode !== 'primary')
          .map(subagentOf),
        contribute: rules,
      }
    },
  })
}
