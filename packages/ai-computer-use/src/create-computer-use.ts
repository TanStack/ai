import { brandProviderTool } from '@tanstack/ai'
import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import { z } from 'zod'
import { runComputerAction } from './actions'
import { computerSafetyCheck, safetyCheckSchema } from './safety-check'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
  ImagePart,
  ProviderTool,
  ToolExecutionContext,
} from '@tanstack/ai'
import type { ComputerUseToolMetadata } from '@tanstack/ai/adapter-internals'
import type { ComputerDriver } from './types'

/** Options for `createComputerUse`. */
export interface CreateComputerUseOptions {
  /** The driver that controls the computer. */
  driver: ComputerDriver
  /**
   * The time in ms between an action and its screenshot. The page or the
   * desktop gets this time to settle. The default is 500.
   */
  screenshotDelay?: number
}

const TOOL_NAME = 'computer'

/** The parts of a computer tool input that the safety check reads. */
const checkedInputSchema = z.object({
  pending_safety_checks: z.array(safetyCheckSchema).nullish(),
  action: z.unknown().optional(),
  actions: z.unknown().optional(),
})

/** The safety checks and the action of an input, or `null` when they do not parse. */
function readCheckedInput(input: unknown) {
  const parsed = checkedInputSchema.safeParse(input)
  if (!parsed.success) return null
  const { action, actions } = parsed.data
  const checks = parsed.data.pending_safety_checks ?? []
  return { checks, action: action ?? actions ?? null }
}

function parseArguments(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function imageResult(bytes: Uint8Array) {
  const part: ImagePart = {
    type: 'image',
    source: {
      type: 'data',
      value: arrayBufferToBase64(bytes.slice().buffer),
      mimeType: 'image/png',
    },
  }
  return [part]
}

/** The computer tool calls in the last assistant message. */
function computerToolCalls(ctx: ChatMiddlewareContext) {
  const message = ctx.messages.findLast((item) => item.role === 'assistant')
  const toolCalls = message?.toolCalls ?? []
  return toolCalls.filter((call) => call.function.name === TOOL_NAME)
}

/**
 * Create a provider-agnostic computer tool for one machine.
 *
 * The OpenAI and Anthropic adapters swap `tool` for their native computer
 * tool. Every action returns a screenshot. `zoom` returns the zoom image, and
 * `cursor_position` returns text.
 *
 * - `tool`: pass it to `chat({ tools })`.
 * - `middleware`: pass it to `chat({ middleware })`. It runs the failed-turn
 *   rule and the OpenAI safety checks.
 * - `interrupt`: pass it to `chat({ interrupts })`. It is the same object as
 *   `computerSafetyCheck`.
 *
 * Actions run one at a time, in call order. After an action throws, the
 * other calls of the same model turn throw too. A call with OpenAI safety
 * checks runs only after a person approves it.
 *
 * @param options - The driver, and the optional `screenshotDelay` in ms.
 *
 * @example
 * ```ts
 * const { tool, middleware, interrupt } = createComputerUse({
 *   driver: createPlaywrightComputerDriver({ page }),
 * })
 *
 * chat({
 *   adapter: openaiText('gpt-6.1-sol'),
 *   messages,
 *   tools: [tool],
 *   middleware: [middleware],
 *   interrupts: [interrupt],
 * })
 * ```
 */
export function createComputerUse({
  driver,
  screenshotDelay = 500,
}: CreateComputerUseOptions): {
  tool: ProviderTool<string, 'computer'>
  // The .d.ts names typeof computerSafetyCheck here, not a copy of its type.
  // TypeScript 5 sees two copies as different types, and chat() rejects them.
  middleware: ChatMiddleware<unknown, typeof computerSafetyCheck>
  interrupt: typeof computerSafetyCheck
} {
  // ponytail: one createComputerUse drives one machine for one conversation
  // at a time. The queue, the failed-turn flag, and the approvals are shared
  // by every chat() call that uses it. Create one per conversation.
  let queue: Promise<unknown> = Promise.resolve()
  let turnFailed = false
  const approved = new Set<string>()
  const declined = new Set<string>()

  async function runAction(input: unknown, toolCallId: string | undefined) {
    if (turnFailed) {
      throw new Error(
        'Not executed: an earlier computer action in this turn failed.',
      )
    }
    try {
      const checked = readCheckedInput(input)
      // Fail closed: checks that do not parse also need an approval.
      const hasChecks = checked === null || checked.checks.length > 0
      const isApproved = toolCallId !== undefined && approved.has(toolCallId)
      if (hasChecks && !isApproved) {
        throw new Error(
          'Refused: this computer action has safety checks that nobody approved. Add the `interrupt` from createComputerUse to chat({ interrupts }) and the `middleware` to chat({ middleware }).',
        )
      }
      const result = await runComputerAction(driver, input)
      if (result === undefined) {
        await sleep(screenshotDelay)
        return imageResult(await driver.screenshot())
      }
      return result.type === 'image' ? imageResult(result.bytes) : result.text
    } catch (error) {
      turnFailed = true
      throw error
    }
  }

  const metadata = {
    __kind: 'computer_use',
    display: driver.display,
    environment: driver.environment,
    capabilities: {
      zoom: typeof driver.zoom === 'function',
      cursorPosition: typeof driver.cursorPosition === 'function',
    },
  } satisfies ComputerUseToolMetadata

  const tool = brandProviderTool<ProviderTool<string, 'computer'>>({
    name: TOOL_NAME,
    description: 'Use a computer with a mouse and a keyboard.',
    metadata,
    execute(input: unknown, context?: ToolExecutionContext) {
      const run = queue.then(() => runAction(input, context?.toolCallId))
      queue = run.catch(() => undefined)
      return run
    },
  })

  const middleware: ChatMiddleware<unknown, typeof computerSafetyCheck> = {
    name: 'computer-use',
    onConfig(ctx) {
      if (ctx.phase === 'beforeModel') turnFailed = false
    },
    onInterruptBoundary(ctx) {
      if (ctx.phase !== 'beforeTools') return undefined
      const interrupts = computerToolCalls(ctx).flatMap((call) => {
        const hasDecision = approved.has(call.id) || declined.has(call.id)
        if (hasDecision) return []
        const checked = readCheckedInput(
          parseArguments(call.function.arguments),
        )
        // The tool refuses a call whose checks do not parse.
        if (checked === null || checked.checks.length === 0) return []
        const { checks, action } = checked
        return [
          computerSafetyCheck.interrupt({
            key: call.id,
            reason: 'computer-safety-check',
            message:
              checks.find((check) => check.message)?.message ??
              'Approve this computer action.',
            payload: { checks, action },
          }),
        ]
      })
      return interrupts.length > 0 ? { interrupts } : undefined
    },
    onInterruptResolution(_ctx, resolutions) {
      const results = resolutions.for(computerSafetyCheck)
      if (results.length === 0) return undefined
      const isAllApproved = results.every(
        (result) => result.status === 'resolved' && result.response.approved,
      )
      const decided = isAllApproved ? approved : declined
      for (const result of results) decided.add(result.request.key)
      return { toolResume: isAllApproved ? 'continue' : 'cancel' }
    },
  }

  return { tool, middleware, interrupt: computerSafetyCheck }
}
