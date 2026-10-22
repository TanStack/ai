import { toolDefinition } from '@tanstack/ai'
import {
  PermissionCallCapability,
  PermissionDecisionCapability,
  PermissionResources,
  PermissionRules,
  configOption,
  decidePermission,
  definePlugin,
  durableTool,
} from '@tanstack/ai-harness'
import { createCodeMode } from './create-code-mode'
import type { AnyTool, Logger, ToolExecutionContext } from '@tanstack/ai'
import type {
  PermissionCallDecision,
  PermissionMode,
  ToolStep,
} from '@tanstack/ai-harness'
import type {
  CodeModeCallHook,
  CodeModeTool,
  CodeModeToolConfig,
  CreateCodeModeResult,
} from './types'

/** The permission modes of `permissions()`, for the `mode` setting. */
const MODES: ReadonlyArray<PermissionMode> = [
  'default',
  'plan',
  'acceptEdits',
  'bypass',
]

/**
 * The default timeout of a program that can wait for the user to approve a
 * call: 10 minutes.
 */
const APPROVAL_TIMEOUT_MS = 600_000

/** The error of a call that a stop cut while it ran. */
const CUT_BY_STOP =
  'This call was cut by a stop and does not run again. The tool may or may not have run. Check before you retry.'

export interface CodeModePluginOptions extends Omit<
  CodeModeToolConfig,
  'tools' | 'aroundCalls'
> {
  /**
   * Which tools move into code mode. Default: every server tool that does
   * not need approval, that has no permission checks (`PermissionResources`),
   * and that `permissions()` allows in plan mode (so no edits, no commands,
   * nothing that asks first). Without `permissions()`, the rules of tool
   * plugins decide. A safe tool with `metadata.codeMode: true`, for example
   * a tool of an `mcp()` server with `codeMode: true`, moves even when
   * `include` does not pick it.
   *
   * `include` can also pick a tool with permission checks or an `ask` rule,
   * for example the coding tools of `workspaceTools()`. Each call of such a
   * tool in a program gets the same decision as a direct tool call: it
   * runs, it throws, or the program waits for the user to approve it.
   * `include` cannot move a tool with `needsApproval`, or a tool that the
   * rules deny: such a tool stays a normal tool call, and code mode warns
   * once to the host logger for each one that `include` picks. The rules
   * decide in the permission mode of the session at each turn, so in plan
   * mode a tool that edits stays a normal tool call.
   */
  include?: (tool: CodeModeTool) => boolean
  /**
   * Make each tool that moves into code mode lazy. The prompt then lists only
   * the tool names, and `lazyToolsConfig.includeDescription` adds part of
   * each description. The model calls `discover_tools` for the signatures of
   * the tools it needs, then calls them in `execute_typescript`. This saves
   * tokens on each turn when there are many tools. Default `false`.
   */
  lazy?: boolean
  /**
   * What happens to the tools that move into code mode. `'remove'`
   * (default): they leave the model's tool list, and the model calls them
   * only in programs. `'keep'`: the model can also call them directly. The
   * session setting `directCalls` changes it while the session runs, for
   * example `session.setPluginSetting({ key: 'directCalls', value: 'keep' })`.
   * A change applies at the next turn.
   */
  directCalls?: 'remove' | 'keep'
  /**
   * The timeout of a program in milliseconds. Default: 30000, or 600000
   * (10 minutes) when a tool with permission checks moved, so that a
   * program can wait for the user to approve a call.
   */
  timeout?: number
}

/**
 * A name that works as a JavaScript identifier. Code mode turns each tool
 * into an `external_<name>` function, and MCP tool names often have `-`.
 */
function identifierOf(name: string) {
  const safe = name.replace(/[^A-Za-z0-9_$]/g, '_')
  return /^[0-9]/.test(safe) ? `_${safe}` : safe
}

/** A tool that runs on the server: not a client tool, and it has `execute`. */
function isServerTool(tool: AnyTool): tool is CodeModeTool {
  const side = '__toolSide' in tool ? tool.__toolSide : 'server'
  return side === 'server' && typeof tool.execute === 'function'
}

/**
 * A short hash of the arguments of a call. A replay compares it, so a
 * program that changed after a stop does not get the result of another
 * call.
 */
// ponytail: FNV-1a on the JSON text. It only has to see a change, not
// resist an attack.
function hashOf(args: unknown) {
  const json: string | undefined = JSON.stringify(args)
  let hash = 0x811c9dc5
  for (const char of json ?? '') {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

/**
 * A result that the log can keep as a step value. JSON drops a function or
 * a symbol, as the isolate does, and a `bigint` is not JSON.
 */
function isKeepable(
  value: unknown,
): value is object | string | number | boolean | null | undefined {
  const type = typeof value
  return type !== 'function' && type !== 'symbol' && type !== 'bigint'
}

/** A `step` of a durable tool call. */
function isToolStep(value: unknown): value is ToolStep {
  return (
    typeof value === 'object' &&
    value !== null &&
    'do' in value &&
    typeof value.do === 'function' &&
    'ask' in value &&
    typeof value.ask === 'function'
  )
}

/**
 * The `step` of the call that runs the program. The harness gives it to
 * the durable `execute_typescript`.
 */
function stepOf(context: ToolExecutionContext | undefined) {
  const step: unknown = context && 'step' in context ? context.step : undefined
  return isToolStep(step) ? step : undefined
}

/**
 * A tool-mode agent asks the user by stopping its turn. A call inside the
 * isolate cannot stop that turn, so it does not run.
 */
const failClosedInAgent = (error: unknown) => {
  const isTurnAsk =
    error instanceof Error && error.name === 'MCPInputRequiredError'
  if (isTurnAsk) {
    throw new Error(
      'This call needs the approval of the user, and this agent cannot ask for it, so the call did not run.',
    )
  }
  throw error
}

/**
 * The hook of one program. Each call of a `guarded` tool gets the decision
 * of a direct tool call: it runs, it throws, or it waits for the user. The
 * log keeps its result in a step of the `execute_typescript` call, so a
 * replay of the program after a stop does not run a finished call again.
 */
function guardCalls({
  guarded,
  decide,
  context,
  signal,
}: {
  /** The moved tools that a direct call checks, by identifier. */
  guarded: ReadonlyMap<string, CodeModeTool>
  /** The decision of `permissions()`. Without it, a call runs, as a direct call does. */
  decide:
    | ((call: {
        tool: string
        args: unknown
      }) => Promise<PermissionCallDecision>)
    | undefined
  /** The context of the `execute_typescript` call. */
  context: ToolExecutionContext | undefined
  /** Aborts when the program ends. */
  signal: AbortSignal
}) {
  const step = stepOf(context)
  // The number of each guarded call: the same on a replay of the program.
  let count = 0
  const hook: CodeModeCallHook = async (call, run) => {
    const tool = guarded.get(call.name)
    if (!tool) return run()
    // The durable `execute_typescript` always gets a step. Fail closed
    // without one.
    if (!step) {
      throw new Error(
        `Code mode cannot check this call of ${tool.name}, so it did not run.`,
      )
    }
    count += 1
    const n = count
    const { name } = tool
    const hash = hashOf(call.args)
    const ran = (value: unknown) => ({
      ok: true as const,
      value: isKeepable(value) ? value : undefined,
      hash,
    })
    const failed = (error: string) => ({ ok: false as const, error, hash })
    const attempt = async () => {
      const checked = (await decide?.({ tool: name, args: call.args })) ?? {
        decision: 'allow' as const,
      }
      switch (checked.decision) {
        case 'deny':
          return failed(checked.error)
        case 'ask': {
          // A question wait: a UI answers it with `session.answer`. The name
          // has the hash of the arguments, so after a stop a program that
          // changed asks again, and no answer approves another call.
          const reply = await step
            .ask({
              name: `approve:${n}:${hash}`,
              message: checked.message,
              schema: checked.schema,
              signal,
            })
            .catch(failClosedInAgent)
          const refusal = await checked.settle(reply)
          if (refusal !== undefined) return failed(refusal)
          break
        }
        case 'allow':
          break
      }
      // A late answer never runs a call after the program ended.
      if (signal.aborted) {
        throw new Error(
          `The program ended, so this call of ${name} did not run.`,
        )
      }
      if (tool.replay !== 'safe') {
        // A start with no result in the log: a stop cut the call while it ran.
        let isFirstStart = false
        await step.do(`start:${n}:${name}`, () => {
          isFirstStart = true
          return true
        })
        if (!isFirstStart) throw new Error(CUT_BY_STOP)
      }
      // A tool error is a result too: a replay throws it again and does not
      // run the tool twice. A stop closes the log first, so a call that it
      // cut keeps no result.
      try {
        return ran(await run())
      } catch (error) {
        return failed(error instanceof Error ? error.message : String(error))
      }
    }
    const kept = await step.do(`call:${n}:${name}`, attempt)
    if (kept.hash !== hash) {
      throw new Error(
        `The program changed after a stop: call ${n} of ${name} has other arguments now, so it did not run.`,
      )
    }
    if (!kept.ok) throw new Error(kept.error)
    return kept.value
  }
  return hook
}

/**
 * `tool` (`execute_typescript`) as a durable tool. Its execute gets `step`,
 * so the log keeps the checked calls of each program. After a stop, the
 * next host runs the program again, and a finished call returns its kept
 * result.
 */
function durable(tool: CreateCodeModeResult['tool']) {
  const { execute } = tool
  if (!execute) throw new Error('execute_typescript has no execute function.')
  return durableTool(
    toolDefinition({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
    }),
    (args, context) => execute(args, context),
  )
}

/** The prompt part for the functions that check the permission rules. */
function checksPrompt(identifiers: Iterable<string>) {
  const names = [...identifiers]
    .map((identifier) => `\`external_${identifier}\``)
    .join(', ')
  return `
### Permission checks

These functions check the permission rules before they run, as a direct tool call does: ${names}. A call can wait for the user to approve it. When the user refuses the call or a rule denies it, the call throws an error that says why.
`
}

/**
 * A harness plugin that gives the model an `execute_typescript` tool. The
 * model writes one TypeScript program that calls several tools, and the
 * program runs in the isolate of `driver` (any `@tanstack/ai-isolate-*`
 * driver). The tools it calls leave the model's tool list, including tools
 * that plugins find at run time, such as MCP tools after `/connect`.
 *
 * By default, only tools that are safe to run without a question move into
 * code mode. The other tools stay normal tool calls. A tool with
 * `metadata.codeMode: true` moves even when `include` does not pick it, but
 * only when it is safe in the same way.
 *
 * `include` can pick more tools, also tools with permission checks, such as
 * the coding tools of `workspaceTools()`. Each call of such a tool in a
 * program gets the same decision as a direct tool call from `permissions()`:
 * it runs, it throws an error with the reason, or the program waits for the
 * user to approve it (a question that `session.answer` answers). The log
 * keeps the result of each such call, so after a stop the next host runs
 * the program again without running a finished call twice. `include` never
 * moves a tool with `needsApproval`, or a tool that the rules deny.
 *
 * With `lazy: true`, the model gets only the names of the moved tools and
 * asks `discover_tools` for the signatures. With `directCalls: 'keep'`, the
 * model can still call the moved tools directly.
 *
 * @example
 * ```ts
 * import { codeMode } from '@tanstack/ai-code-mode/harness'
 * import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
 *
 * defineHarness({
 *   name: 'acme/agent',
 *   adapter,
 *   plugins: () => [codeMode({ driver: createQuickJSIsolateDriver() })],
 * })
 * ```
 */
export function codeMode(options: CodeModePluginOptions) {
  const { include, lazy = false, directCalls = 'remove', ...config } = options
  /** The tools that `include` picked but cannot move, warned once each. */
  const warned = new Set<string>()
  const warnKept = (logger: Logger, name: string) => {
    if (warned.has(name)) return
    warned.add(name)
    logger.warn(
      `[@tanstack/ai-code-mode] include picked the tool ${JSON.stringify(name)}, but it needs approval, or the rules deny it. Such a tool stays a normal tool call.`,
    )
  }
  return definePlugin({
    name: 'tanstack/code-mode',
    optionalRequires: [PermissionDecisionCapability, PermissionCallCapability],
    setup: (ctx) => {
      const rules = ctx.collect(PermissionRules)
      const resources = ctx.collect(PermissionResources)
      // The system prompt for the tools of the current turn.
      let prompt = ''
      // Each moved tool is safe, or each of its calls gets the decision of
      // a direct call, so a program is as safe as its tools. Allow the code
      // mode tools, so `default: 'ask'` does not ask for (or plan mode deny)
      // every program. A snippet runs code of its own, so with snippets
      // they get no rule. The user's rules come later and still win.
      const allowCodeMode = config.getSnippetBindings
        ? []
        : ['execute_typescript', 'discover_tools'].map((tool) =>
            PermissionRules.item({ tool, decision: 'allow', kind: 'read' }),
          )
      return {
        config: {
          directCalls: configOption.select({
            options: ['remove', 'keep'],
            default: directCalls,
            description:
              'remove: the tools of code mode leave the tool list. keep: the model can also call them directly.',
          }),
        },
        prompts: [{ id: 'tanstack/code-mode', text: () => prompt }],
        contribute: allowCodeMode,
        prepareTools: ({ tools }) => {
          // A failed run below must not leave the prompt of a past turn.
          prompt = ''
          // Ask permissions() when it is mounted: it knows all rules in its
          // order and its default. Read here, so it can come after code mode.
          const decide = ctx.getOptional(PermissionDecisionCapability)
          const decisionOf = (tool: CodeModeTool, mode: PermissionMode) =>
            decide?.(tool.name, mode) ??
            decidePermission(rules, tool.name, mode)
          // A direct call of such a tool checks the paths or the commands
          // that it touches.
          const hasChecks = (tool: CodeModeTool) =>
            resources.some((map) => Object.hasOwn(map, tool.name))
          // The default pick: a call needs no approval and no check, also
          // in plan mode.
          const safe = (tool: CodeModeTool) =>
            !tool.needsApproval &&
            !hasChecks(tool) &&
            decisionOf(tool, 'plan') === 'allow'
          // The permission mode of the session now, read at each turn. In
          // plan mode, a tool that edits must stay a tool call, where the
          // rules deny it.
          const value = ctx.config.get('mode')
          const mode = MODES.find((each) => each === value) ?? 'default'
          // `include` widens the pick past plan mode: each call of a tool
          // with checks gets the decision of a direct call. A call inside the
          // isolate cannot wait for `needsApproval`, and a tool that the
          // rules deny stays a tool call.
          const canInclude = (tool: CodeModeTool) =>
            !tool.needsApproval && decisionOf(tool, mode) !== 'deny'
          const moves = (tool: CodeModeTool) => {
            // A marked tool still needs the checks of the default pick.
            const isMarked = tool.metadata?.codeMode === true
            if (isMarked && safe(tool)) return true
            if (!include) return safe(tool)
            if (!include(tool)) return false
            if (canInclude(tool)) return true
            warnKept(ctx.logger, tool.name)
            return false
          }
          // Two tools that map to the same identifier: the first one moves.
          const byIdentifier = new Map<string, CodeModeTool>()
          for (const tool of tools.filter(isServerTool)) {
            if (!moves(tool)) continue
            const identifier = identifierOf(tool.name)
            if (!byIdentifier.has(identifier))
              byIdentifier.set(identifier, tool)
          }
          if (byIdentifier.size === 0) return tools
          // The moved tools that a direct call checks. Each of their calls in
          // a program gets the same decision.
          const guarded = new Map(
            [...byIdentifier].filter(
              ([, tool]) =>
                hasChecks(tool) || decisionOf(tool, mode) !== 'allow',
            ),
          )
          const isGuarded = guarded.size > 0
          // A program with checked calls can wait for the user.
          const timeout =
            config.timeout ?? (isGuarded ? APPROVAL_TIMEOUT_MS : undefined)
          const created = createCodeMode({
            ...config,
            timeout,
            tools: [...byIdentifier].map(([identifier, tool]) =>
              identifier === tool.name && !lazy
                ? tool
                : { ...tool, name: identifier, ...(lazy ? { lazy } : {}) },
            ),
            aroundCalls: isGuarded
              ? (context, signal) =>
                  guardCalls({
                    guarded,
                    decide: ctx.getOptional(PermissionCallCapability),
                    context,
                    signal,
                  })
              : undefined,
          })
          prompt = isGuarded
            ? `${created.systemPrompt}${checksPrompt(guarded.keys())}`
            : created.systemPrompt
          // The log keeps the checked calls of a program, so it is durable.
          const program = isGuarded ? durable(created.tool) : created.tool
          const moved = new Set(
            [...byIdentifier.values()].map((tool) => tool.name),
          )
          // With `directCalls: 'keep'`, the model can still call a moved
          // tool directly.
          const keepsDirect = ctx.config.get('directCalls') === 'keep'
          const direct = keepsDirect
            ? tools
            : tools.filter((tool) => !moved.has(tool.name))
          return [
            ...direct,
            ...created.tools.map((tool) =>
              tool === created.tool ? program : tool,
            ),
          ]
        },
      }
    },
  })
}
