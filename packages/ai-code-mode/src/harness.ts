import {
  PermissionRules,
  decidePermission,
  definePlugin,
} from '@tanstack/ai-harness'
import { createCodeMode } from './create-code-mode'
import type { AnyTool } from '@tanstack/ai'
import type { CodeModeTool, CodeModeToolConfig } from './types'

export interface CodeModePluginOptions extends Omit<
  CodeModeToolConfig,
  'tools'
> {
  /**
   * Which tools move into code mode. Default: every server tool that does
   * not need approval and that the permission rules allow in plan mode (so
   * no edits, no commands, nothing that asks first).
   */
  include?: (tool: CodeModeTool) => boolean
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
 * other tools stay normal tool calls.
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
  const { include, ...config } = options
  return definePlugin({
    name: 'tanstack/code-mode',
    setup: (ctx) => {
      const rules = ctx.collect(PermissionRules)
      const safe = (tool: CodeModeTool) =>
        !tool.needsApproval &&
        decidePermission(rules, tool.name, 'plan') === 'allow'
      // The system prompt for the tools of the current turn.
      let prompt = ''
      return {
        prompts: [{ id: 'tanstack/code-mode', text: () => prompt }],
        prepareTools: (tools) => {
          // Two tools that map to the same identifier: the first one moves.
          const byIdentifier = new Map<string, CodeModeTool>()
          for (const tool of tools.filter(isServerTool)) {
            if (!(include ? include(tool) : safe(tool))) continue
            const identifier = identifierOf(tool.name)
            if (!byIdentifier.has(identifier))
              byIdentifier.set(identifier, tool)
          }
          if (byIdentifier.size === 0) {
            prompt = ''
            return tools
          }
          const created = createCodeMode({
            ...config,
            tools: [...byIdentifier].map(([identifier, tool]) =>
              identifier === tool.name ? tool : { ...tool, name: identifier },
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
