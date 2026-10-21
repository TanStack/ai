import {
  PermissionDecisionCapability,
  PermissionResources,
  PermissionRules,
  definePlugin,
} from '@tanstack/ai-harness'
import { mediaPart } from '@tanstack/ai-harness/media'
import { base64ToUint8Array } from '@tanstack/ai-utils'
import { createComputerUse, readCheckedInput } from './create-computer-use'
import type {
  AnyChatMiddleware,
  AnyTool,
  ContentPart,
  ModelMessage,
} from '@tanstack/ai'
import type { PluginSessionApi } from '@tanstack/ai-harness'
import type { CreateComputerUseOptions } from './create-computer-use'

/** Options for the `computerUse` harness plugin. */
export interface ComputerUsePluginOptions extends CreateComputerUseOptions {
  /**
   * How many of the newest screenshots the model gets. An older screenshot
   * goes to the model as a 1x1 image. The transcript keeps every
   * screenshot. The default is 3.
   */
  keepScreenshots?: number
}

/**
 * The permission action of a computer call with OpenAI safety checks.
 * `@unsaved:` makes it ask each time: an `always` answer saves no rule.
 */
const SAFETY_CHECK = 'computer-safety-check@unsaved:'

/**
 * A 1x1 PNG. It replaces an old screenshot, because the OpenAI computer call
 * output must have an image.
 */
const PLACEHOLDER: ContentPart = {
  type: 'image',
  source: {
    type: 'data',
    value:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    mimeType: 'image/png',
  },
}

/** True when a computer input has safety checks, or checks that do not parse. */
function hasSafetyChecks(input: unknown) {
  const checked = readCheckedInput(input)
  return checked === null || checked.checks.length > 0
}

/**
 * `messages`, with the images of all but the newest `keep` results of the
 * tools in `names` swapped for a 1x1 image. The same array when nothing
 * changes.
 */
export function keepNewestScreenshots(
  messages: Array<ModelMessage>,
  names: ReadonlySet<string>,
  keep: number,
) {
  const callIds = new Set(
    messages.flatMap((message) =>
      (message.toolCalls ?? [])
        .filter((call) => names.has(call.function.name))
        .map((call) => call.id),
    ),
  )
  let seen = 0
  let changed = false
  const kept = [...messages].reverse().map((message) => {
    const { content } = message
    const isScreenshot =
      message.role === 'tool' &&
      message.toolCallId !== undefined &&
      callIds.has(message.toolCallId) &&
      Array.isArray(content) &&
      content.some((part) => part.type === 'image')
    if (!isScreenshot) return message
    seen += 1
    if (seen <= keep) return message
    changed = true
    const parts = content.map((part) =>
      part.type === 'image' ? PLACEHOLDER : part,
    )
    return { ...message, content: parts }
  })
  return changed ? kept.reverse() : messages
}

/** The result of a tool, with each inline image stored in the media store. */
async function storeImages(
  result: unknown,
  putMedia: PluginSessionApi['putMedia'],
) {
  if (!Array.isArray(result)) return result
  const parts: Array<ContentPart> = result
  return Promise.all(
    parts.map(async (part) => {
      if (part.type !== 'image' || part.source.type !== 'data') return part
      const record = await putMedia({
        body: base64ToUint8Array(part.source.value),
        mimeType: part.source.mimeType,
        name: 'screenshot.png',
      })
      return mediaPart(record)
    }),
  )
}

/**
 * Computer use in a harness. It adds the `computer` tool, and `navigate`
 * when the driver can navigate. Each thread of a session gets its own
 * machine from a driver factory.
 *
 * - Each screenshot goes to the media store of the session. The transcript
 *   and the log keep a small `harness-media:` reference.
 * - The model gets only the newest `keepScreenshots` screenshots.
 * - A call with OpenAI safety checks asks the user through `permissions()`,
 *   each time. Without `permissions()`, such a call is refused. The
 *   `bypass` mode runs it with no question.
 * - The `plan` mode of `permissions()` refuses the `computer` tool.
 *
 * The machines live on the host, and close when the host closes. A thread
 * that stays idle for `idleTimeout` loses its machine.
 *
 * @example
 * ```ts
 * defineHarness({
 *   name: 'browser-agent',
 *   adapter: openaiText('gpt-6.1-sol'),
 *   plugins: [
 *     permissions(),
 *     computerUse({ driver: playwrightComputer({ startUrl: 'https://tanstack.com' }) }),
 *   ],
 * })
 * ```
 */
export function computerUse({
  keepScreenshots = 3,
  ...options
}: ComputerUsePluginOptions) {
  return definePlugin({
    name: 'tanstack/computer-use',
    // One browser or one sandbox pool for the host, shared by its sessions.
    lifetime: 'host',
    optionalRequires: [PermissionDecisionCapability],
    setup: async ({ resources }) => {
      const computer = await resources.acquire(
        () => createComputerUse(options),
        (opened) => opened.close(),
      )
      const names = new Set(computer.tools.map((tool) => tool.name))
      const middleware = {
        name: 'tanstack/computer-use',
        onConfig: async (ctx, config) => {
          // It resets the failed-turn rule of the thread before each model call.
          await computer.middleware.onConfig?.(ctx, config)
          if (ctx.phase !== 'beforeModel') return undefined
          const messages = config.providerMessages ?? config.messages
          const kept = keepNewestScreenshots(messages, names, keepScreenshots)
          return kept === messages ? undefined : { providerMessages: kept }
        },
      } satisfies AnyChatMiddleware
      return {
        middleware: [middleware],
        agentMiddleware: [middleware],
        contribute: [
          // `execute`, so the plan mode refuses the clicks and the key presses.
          PermissionRules.item({
            tool: 'computer',
            decision: 'allow',
            kind: 'execute',
          }),
          PermissionRules.item({ tool: SAFETY_CHECK, decision: 'ask' }),
          PermissionResources.item({
            computer: {
              actions: (input) =>
                hasSafetyChecks(input) ? [SAFETY_CHECK] : [],
            },
          }),
        ],
        session: (ctx) => {
          // `permissions()` asked the user before the call ran, so the tool
          // runs it. Without `permissions()`, the tool refuses it.
          const isAsked =
            ctx.getOptional(PermissionDecisionCapability) !== undefined
          const tools = computer.tools.map((tool: AnyTool): AnyTool => {
            const { execute } = tool
            if (execute === undefined) return tool
            const run = async (input: unknown, context: unknown) => {
              if (
                !isAsked &&
                tool.name === 'computer' &&
                hasSafetyChecks(input)
              ) {
                throw new Error(
                  'Refused: this computer action has safety checks, and nobody can approve them. Add permissions() to the plugins of the harness.',
                )
              }
              const checked =
                isAsked && tool.name === 'computer' && isRecord(input)
                  ? { ...input, pending_safety_checks: [] }
                  : input
              const result: unknown = await execute(checked, context)
              return storeImages(result, ctx.session.putMedia)
            }
            return { ...tool, execute: run }
          })
          return { tools }
        },
      }
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
