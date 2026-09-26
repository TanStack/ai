import { defineCommand } from '../commands'
import { configOption } from '../config'
import { createExtensionPoint } from '../extensions'
import { definePlugin } from '../plugins'

export type PermissionDecision = 'allow' | 'ask' | 'deny'

/** A rule for one tool. `kind` lets the modes treat edits and commands differently. */
export interface PermissionRule {
  /** A tool name. A trailing `*` matches a prefix, for example `git_*`. */
  tool: string
  decision: PermissionDecision
  kind?: 'read' | 'edit' | 'execute'
}

/** Tool plugins add their rules here. `permissions()` reads them. */
export const PermissionRules = createExtensionPoint<PermissionRule>(
  'tanstack/permission-rules',
)

export const PERMISSION_MODES = [
  'default',
  'plan',
  'acceptEdits',
  'bypass',
] as const
export type PermissionMode = (typeof PERMISSION_MODES)[number]

function matches(rule: PermissionRule, tool: string): boolean {
  return rule.tool.endsWith('*')
    ? tool.startsWith(rule.tool.slice(0, -1))
    : rule.tool === tool
}

/** The decision for a tool in a mode. The last matching rule wins. */
export function decidePermission(
  rules: ReadonlyArray<PermissionRule>,
  tool: string,
  mode: PermissionMode,
  fallback: PermissionDecision = 'allow',
): PermissionDecision {
  const rule = rules.findLast((candidate) => matches(candidate, tool))
  const decision = rule?.decision ?? fallback
  if (mode === 'bypass') return 'allow'
  if (mode === 'plan') {
    return rule?.kind === 'edit' ||
      rule?.kind === 'execute' ||
      decision !== 'allow'
      ? 'deny'
      : 'allow'
  }
  if (mode === 'acceptEdits' && rule?.kind === 'edit' && decision === 'ask')
    return 'allow'
  return decision
}

const PLAN_PROMPT =
  'You are in plan mode. Do not change files or run commands. Read what you need, then describe your plan.'

/**
 * Check every tool call against permission rules, with a `mode` setting and a
 * `/mode` command:
 *
 * - `default`: rules apply as written. `ask` asks the user.
 * - `plan`: read-only. Edits and commands are denied.
 * - `acceptEdits`: edits run without asking. Commands still ask.
 * - `bypass`: everything runs.
 */
export function permissions(
  options: {
    rules?: ReadonlyArray<PermissionRule>
    default?: PermissionDecision
  } = {},
) {
  return definePlugin({
    name: 'tanstack/permissions',
    setup: (ctx) => {
      const contributed = ctx.collect(PermissionRules)
      const mode = (): PermissionMode => {
        const value = ctx.config.get('mode')
        return (
          PERMISSION_MODES.find((candidate) => candidate === value) ?? 'default'
        )
      }
      return {
        config: {
          mode: configOption.select({
            options: PERMISSION_MODES,
            default: 'default',
            category: 'mode',
            description: 'How tool calls are approved',
          }),
        },
        prompts: [
          {
            id: 'tanstack/permissions:plan',
            text: () => (mode() === 'plan' ? PLAN_PROMPT : ''),
          },
        ],
        commands: {
          mode: defineCommand({
            description: `Show or switch the mode (${PERMISSION_MODES.join(', ')})`,
            run: async (input: unknown) => {
              const next = typeof input === 'string' ? input.trim() : ''
              if (!next) return `Mode: ${mode()}.`
              const receipt = await ctx.session.setConfig('mode', next)
              return receipt.status === 'rejected'
                ? `Unknown mode "${next}". Modes: ${PERMISSION_MODES.join(', ')}.`
                : `Mode: ${next}.`
            },
          }),
        },
        middleware: [
          {
            name: 'tanstack/permissions',
            onBeforeToolCall: async (_run, hook) => {
              const rules = [...(options.rules ?? []), ...contributed]
              const decision = decidePermission(
                rules,
                hook.toolName,
                mode(),
                options.default,
              )
              if (decision === 'allow') return undefined
              if (decision === 'ask') {
                const preview = JSON.stringify(hook.args ?? {}).slice(0, 300)
                const answer: unknown = await ctx.session.ask({
                  message: `Allow ${hook.toolName} ${preview}? (y/n)`,
                })
                const allowed =
                  answer === true || /^y(es)?$/i.test(String(answer).trim())
                if (allowed) return undefined
              }
              return {
                type: 'skip',
                result: {
                  denied: true,
                  reason:
                    decision === 'ask'
                      ? 'The user denied this tool call.'
                      : `This tool is not allowed in ${mode()} mode.`,
                },
              }
            },
          },
        ],
      }
    },
  })
}
