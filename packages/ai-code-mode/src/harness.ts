import {
  PermissionDecisionCapability,
  PermissionResources,
  PermissionRules,
  decidePermission,
  definePlugin,
} from '@tanstack/ai-harness'
import { createCodeMode } from './create-code-mode'
import type { AnyTool } from '@tanstack/ai'
import type { PermissionMode } from '@tanstack/ai-harness'
import type { CodeModeTool, CodeModeToolConfig } from './types'

/** The permission modes of `permissions()`, for the `mode` setting. */
const MODES: ReadonlyArray<PermissionMode> = [
  'default',
  'plan',
  'acceptEdits',
  'bypass',
]

export interface CodeModePluginOptions extends Omit<
  CodeModeToolConfig,
  'tools'
> {
  /**
   * Which tools move into code mode. Default: every server tool that does
   * not need approval and that `permissions()` allows in plan mode (so no
   * edits, no commands, nothing that asks first). Without `permissions()`,
   * the rules of tool plugins decide. A safe tool with
   * `metadata.codeMode: true`, for example a tool of an `mcp()` server with
   * `codeMode: true`, moves even when `include` does not pick it.
   *
   * `include` cannot move a tool with `needsApproval`, or a tool that a rule
   * asks for or denies: such a tool stays a normal tool call, with its
   * approval and its checks. Code mode warns once for each such tool that `include`
   * picks. The rules decide in the permission mode of the session at each
   * turn, so in plan mode a tool that edits stays a normal tool call.
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
}

/**
 * A name that works as a JavaScript identifier. Code mode turns each tool
 * into an `external_<name>` function, and MCP tool names often have `-`.
 */
function identifierOf(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9_$]/g, '_')
  return /^[0-9]/.test(safe) ? `_${safe}` : safe
}

/** A tool that runs on the server: not a client tool, and it has `execute`. */
function isServerTool(tool: AnyTool): tool is CodeModeTool {
  const side = '__toolSide' in tool ? tool.__toolSide : 'server'
  return side === 'server' && typeof tool.execute === 'function'
}

/**
 * A harness plugin that gives the model an `execute_typescript` tool. The
 * model writes one TypeScript program that calls several tools, and the
 * program runs in the isolate of `driver` (any `@tanstack/ai-isolate-*`
 * driver). The tools it calls leave the model's tool list, including tools
 * that plugins find at run time, such as MCP tools after `/connect`.
 *
 * Calls inside the isolate do not stop for approval, so by default only
 * tools that are safe to run without a question move into code mode. The
 * other tools stay normal tool calls. A tool with `metadata.codeMode: true`
 * moves even when `include` does not pick it, but only when it is safe in
 * the same way. `include` can pick more tools, but never a tool with
 * `needsApproval` or a tool that a rule asks for or denies. Calls inside the
 * isolate also skip the permission checks, so a tool that declares
 * `PermissionResources` never moves. With
 * `lazy: true`, the model gets only the names of the moved tools and asks
 * `discover_tools` for the signatures.
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
  const { include, lazy = false, ...config } = options
  /** The tools that `include` picked but cannot move, warned once each. */
  const warned = new Set<string>()
  const warnKept = (name: string) => {
    if (warned.has(name)) return
    warned.add(name)
    console.warn(
      `[@tanstack/ai-code-mode] include picked the tool ${JSON.stringify(name)}, but it needs approval, or a rule asks for it or denies it. A call inside code mode skips those checks, so the tool stays a normal tool call.`,
    )
  }
  return definePlugin({
    name: 'tanstack/code-mode',
    optionalRequires: [PermissionDecisionCapability],
    setup: (ctx) => {
      const rules = ctx.collect(PermissionRules)
      const resources = ctx.collect(PermissionResources)
      // The system prompt for the tools of the current turn.
      let prompt = ''
      // Without `include` or snippets, only tools that plan mode allows
      // move, so a program is as safe as its tools. Allow the code mode
      // tools, so `default: 'ask'` does not ask for (or plan mode deny)
      // every program. The user's rules come later and still win.
      const isDefaultPick = !include && !config.getSnippetBindings
      const allowCodeMode = isDefaultPick
        ? ['execute_typescript', 'discover_tools'].map((tool) =>
            PermissionRules.item({ tool, decision: 'allow', kind: 'read' }),
          )
        : []
      return {
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
          const safe = (tool: CodeModeTool) =>
            !tool.needsApproval && decisionOf(tool, 'plan') === 'allow'
          // The permission mode of the session now, read at each turn. In
          // plan mode, a tool that edits must stay a tool call, where the
          // rules deny it.
          const value = ctx.config.get('mode')
          const mode = MODES.find((each) => each === value) ?? 'default'
          // `include` widens the pick past plan mode, but a call inside the
          // isolate must not skip an approval, an `ask` rule, or a deny rule.
          const canInclude = (tool: CodeModeTool) =>
            !tool.needsApproval && decisionOf(tool, mode) === 'allow'
          const moves = (tool: CodeModeTool) => {
            // The permission checks run on tool calls of the model. A call
            // inside the isolate skips them, so such a tool stays a tool call.
            const hasResources = resources.some((map) =>
              Object.hasOwn(map, tool.name),
            )
            if (hasResources) return false
            // A marked tool still needs the checks of the default pick.
            const isMarked = tool.metadata?.codeMode === true
            if (isMarked && safe(tool)) return true
            if (!include) return safe(tool)
            if (!include(tool)) return false
            if (canInclude(tool)) return true
            warnKept(tool.name)
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
          const created = createCodeMode({
            ...config,
            tools: [...byIdentifier].map(([identifier, tool]) =>
              identifier === tool.name && !lazy
                ? tool
                : { ...tool, name: identifier, ...(lazy ? { lazy } : {}) },
            ),
          })
          prompt = created.systemPrompt
          const moved = new Set(
            [...byIdentifier.values()].map((tool) => tool.name),
          )
          return [
            ...tools.filter((tool) => !moved.has(tool.name)),
            ...created.tools,
          ]
        },
      }
    },
  })
}
