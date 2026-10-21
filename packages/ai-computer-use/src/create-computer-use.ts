import { brandProviderTool, toolDefinition } from '@tanstack/ai'
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
import type { ComputerDriver, ComputerDriverFactory } from './types'

/** Options for `createComputerUse`. */
export interface CreateComputerUseOptions {
  /**
   * The machine to control.
   *
   * - A driver is one machine. Every thread shares it. `createComputerUse`
   *   never closes it.
   * - A driver factory makes one machine per thread, on the first call of the
   *   thread. `createComputerUse` closes that machine when the thread closes
   *   or goes idle.
   */
  driver: ComputerDriver | ComputerDriverFactory
  /**
   * The time in ms between an action and its screenshot. The page or the
   * desktop gets this time to settle. The default is 500.
   */
  screenshotDelay?: number
  /**
   * The time in ms that a thread can stay idle. After this time, the state of
   * the thread is dropped, and its machine from the factory is closed. The
   * next call of the thread gets a new machine. `false` keeps every thread
   * until `close`. The default is 600000 (10 minutes).
   */
  idleTimeout?: number | false
}

const TOOL_NAME = 'computer'

/** The thread of a call with no `threadId`, like a direct `execute()` call. */
const SHARED_THREAD = 'computer-use:shared'

/** The state of one thread. */
interface ThreadState {
  id: string
  /** The machine from the factory. It stays unset for a driver that the app passed in. */
  driver: Promise<ComputerDriver> | undefined
  /** This thread's last queued action. A shared driver uses one queue for every thread. */
  queue: Promise<unknown>
  /** The number of actions in the queue. */
  pending: number
  turnFailed: boolean
  approved: Set<string>
  declined: Set<string>
  timer: ReturnType<typeof setTimeout> | undefined
}

const navigateDefinition = toolDefinition({
  name: 'navigate',
  description: 'Go to a URL in the browser. Returns a screenshot.',
  inputSchema: z.object({
    url: z
      .string()
      .describe(
        'The full URL that starts with https:// or http://, like https://tanstack.com.',
      ),
  }),
})

type ComputerTool = ProviderTool<string, 'computer'>
type NavigateTool = ReturnType<typeof navigateDefinition.server>

/** The parts of a computer tool input that the safety check reads. */
const checkedInputSchema = z.object({
  pending_safety_checks: z.array(safetyCheckSchema).nullish(),
  action: z.unknown().optional(),
  actions: z.unknown().optional(),
})

/** The safety checks and the action of an input, or `null` when they do not parse. */
export function readCheckedInput(input: unknown) {
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

/** True for an `http:` or an `https:` URL. */
function isWebUrl(url: string) {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
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
      // Copy the bytes. The ArrayBuffer of a small Node Buffer is a shared pool.
      value: arrayBufferToBase64(new Uint8Array(bytes).buffer),
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
 * Create a provider-agnostic computer tool. Each thread gets its own state.
 * A driver factory gives each thread its own machine. A driver that you pass
 * in is one machine, and its actions run one at a time across threads.
 *
 * The OpenAI and Anthropic adapters swap the computer tool for their native
 * computer tool. A normal action returns a screenshot. An OpenAI batch
 * returns one screenshot after the last action. `zoom` returns the zoom
 * image, and `cursor_position` returns text. Those two do not take another
 * screenshot.
 *
 * - `tools`: pass it to `chat({ tools })`. It is `[computer]`. When the
 *   driver can navigate, it is `[computer, navigate]`.
 * - `middleware`: pass it to `chat({ middleware })`. It runs the failed-turn
 *   rule and the OpenAI safety checks.
 * - `interrupt`: pass it to `chat({ interrupts })`. It is the same object as
 *   `computerSafetyCheck`.
 * - `close(threadId)`: close the machine of one thread. `close()` closes
 *   every thread, then the driver factory.
 *
 * The thread is the `threadId` of `chat()`. Pass the thread id of the client
 * to `chat()`. In one thread, actions run one at a time, in call order. After
 * an action throws, the other calls of the same model turn throw too. A call
 * with OpenAI safety checks runs only after a person approves it. When a
 * thread stays idle for `idleTimeout`, its state is dropped and its machine
 * from the factory is closed.
 *
 * @param options - The driver or the driver factory, the optional
 *   `screenshotDelay` in ms, and the optional `idleTimeout` in ms.
 *
 * @example
 * ```ts
 * const computerUse = createComputerUse({
 *   driver: playwrightComputer({ startUrl: 'https://tanstack.com' }),
 * })
 *
 * chat({
 *   adapter: openaiText('gpt-6.1-sol'),
 *   messages,
 *   threadId,
 *   tools: computerUse.tools,
 *   middleware: [computerUse.middleware],
 *   interrupts: [computerUse.interrupt],
 * })
 * ```
 */
export function createComputerUse({
  driver,
  screenshotDelay = 500,
  idleTimeout = 600_000,
}: CreateComputerUseOptions): {
  tools: [ComputerTool] | [ComputerTool, NavigateTool]
  // The .d.ts names typeof computerSafetyCheck here, not a copy of its type.
  // TypeScript 5 sees two copies as different types, and chat() rejects them.
  middleware: ChatMiddleware<unknown, typeof computerSafetyCheck>
  interrupt: typeof computerSafetyCheck
  close: (threadId?: string) => Promise<void>
} {
  // ponytail: the machines live in this process only. When the next request
  // of a thread reaches another server, the thread gets a new machine there.
  // ponytail: without a stable threadId, chat() makes a new id for each
  // request, so each request gets a new machine. Pass threadId to chat().
  // ponytail: when a person answers a safety check after idleTimeout, the
  // approved action runs on a new machine. Set idleTimeout above that wait.
  // ponytail: one queue for a shared driver. Per-thread queues if two
  // threads on one machine must overlap.
  const threads = new Map<string, ThreadState>()
  const sharesOneMachine = !('create' in driver)
  let sharedQueue: Promise<unknown> = Promise.resolve()

  function startTimer(thread: ThreadState) {
    clearTimeout(thread.timer)
    const isOpen = threads.get(thread.id) === thread
    if (idleTimeout === false || !isOpen) return
    thread.timer = setTimeout(() => {
      // Nobody waits for an idle close. Log the error so a stuck machine is visible.
      closeThread(thread).catch((error: unknown) => {
        console.error(
          `Failed to close the idle computer thread ${thread.id}.`,
          error,
        )
      })
    }, idleTimeout)
    thread.timer.unref?.()
  }

  function threadOf(threadId: string) {
    const known = threads.get(threadId)
    if (known) return known
    const thread: ThreadState = {
      id: threadId,
      driver: undefined,
      queue: Promise.resolve(),
      pending: 0,
      turnFailed: false,
      approved: new Set(),
      declined: new Set(),
      timer: undefined,
    }
    threads.set(threadId, thread)
    startTimer(thread)
    return thread
  }

  /** Drop the thread, wait for its queue, then close its machine from the factory. */
  async function closeThread(thread: ThreadState) {
    if (threads.get(thread.id) === thread) threads.delete(thread.id)
    clearTimeout(thread.timer)
    await thread.queue
    const machine = await thread.driver
    await machine?.close?.()
  }

  function machineOf(thread: ThreadState) {
    if (!('create' in driver)) return driver
    thread.driver ??= driver
      .create({ threadId: thread.id })
      .catch((error: unknown) => {
        // The next call of the thread calls create again.
        thread.driver = undefined
        throw error
      })
    return thread.driver
  }

  /** Run `work` in the queue of the thread, with the failed-turn rule. */
  function runInThread<T>(
    threadId: string | undefined,
    work: (thread: ThreadState) => Promise<T>,
  ) {
    const thread = threadOf(threadId ?? SHARED_THREAD)
    clearTimeout(thread.timer)
    thread.pending += 1
    const previous = sharesOneMachine ? sharedQueue : thread.queue
    const run = previous.then(async () => {
      if (thread.turnFailed) {
        throw new Error(
          'Not executed: an earlier computer action in this turn failed.',
        )
      }
      try {
        return await work(thread)
      } catch (error) {
        thread.turnFailed = true
        throw error
      }
    })
    // Swallow here so the next action runs. `run` still rejects for the caller.
    // On a shared driver, `settled` follows the actions of other threads, so
    // closing a thread waits for them too. Closing a thread never closes a
    // shared driver, so this wait does no harm.
    const settled = run
      .catch(() => undefined)
      .then(() => {
        thread.pending -= 1
        if (thread.pending === 0) startTimer(thread)
      })
    if (sharesOneMachine) sharedQueue = settled
    thread.queue = settled
    return run
  }

  const capabilities =
    'create' in driver
      ? driver.capabilities
      : {
          zoom: typeof driver.zoom === 'function',
          cursorPosition: typeof driver.cursorPosition === 'function',
          navigate: typeof driver.navigate === 'function',
        }

  const metadata = {
    __kind: 'computer_use',
    display: driver.display,
    environment: driver.environment,
    capabilities: {
      zoom: capabilities.zoom,
      cursorPosition: capabilities.cursorPosition,
    },
  } satisfies ComputerUseToolMetadata

  const computer = brandProviderTool<ComputerTool>({
    name: TOOL_NAME,
    description: 'Use a computer with a mouse and a keyboard.',
    metadata,
    execute(input: unknown, context?: ToolExecutionContext) {
      return runInThread(context?.threadId, async (thread) => {
        const checked = readCheckedInput(input)
        // Fail closed: checks that do not parse also need an approval.
        const hasChecks = checked === null || checked.checks.length > 0
        const toolCallId = context?.toolCallId
        const isApproved =
          toolCallId !== undefined && thread.approved.has(toolCallId)
        if (hasChecks && !isApproved) {
          throw new Error(
            'Refused: this computer action has safety checks that nobody approved. Add the `interrupt` from createComputerUse to chat({ interrupts }) and the `middleware` to chat({ middleware }).',
          )
        }
        const machine = await machineOf(thread)
        const result = await runComputerAction(machine, input)
        if (result === undefined) {
          await sleep(screenshotDelay)
          return imageResult(await machine.screenshot())
        }
        return result.type === 'image' ? imageResult(result.bytes) : result.text
      })
    },
  })

  const navigate = navigateDefinition.server(({ url }, context) =>
    runInThread(context?.threadId, async (thread) => {
      if (!isWebUrl(url)) {
        throw new Error(
          'Refused: navigate needs a full URL that starts with https:// or http://, like https://tanstack.com.',
        )
      }
      const machine = await machineOf(thread)
      if (machine.navigate === undefined) {
        throw new Error('The computer driver has no navigate method.')
      }
      await machine.navigate(url)
      await sleep(screenshotDelay)
      return imageResult(await machine.screenshot())
    }),
  )

  const middleware: ChatMiddleware<unknown, typeof computerSafetyCheck> = {
    name: 'computer-use',
    onConfig(ctx) {
      const thread = threads.get(ctx.threadId)
      if (ctx.phase === 'beforeModel' && thread) thread.turnFailed = false
    },
    onInterruptBoundary(ctx) {
      if (ctx.phase !== 'beforeTools') return undefined
      const thread = threads.get(ctx.threadId)
      const interrupts = computerToolCalls(ctx).flatMap((call) => {
        const hasDecision =
          thread?.approved.has(call.id) || thread?.declined.has(call.id)
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
    onInterruptResolution(ctx, resolutions) {
      const results = resolutions.for(computerSafetyCheck)
      if (results.length === 0) return undefined
      const thread = threadOf(ctx.threadId)
      const isAllApproved = results.every(
        (result) => result.status === 'resolved' && result.response.approved,
      )
      const decided = isAllApproved ? thread.approved : thread.declined
      for (const result of results) decided.add(result.request.key)
      return { toolResume: isAllApproved ? 'continue' : 'cancel' }
    },
  }

  async function close(threadId?: string) {
    if (threadId !== undefined) {
      const thread = threads.get(threadId)
      if (thread) await closeThread(thread)
      return
    }
    const all = [...threads.values()]
    // A failed thread close does not keep the browser open. Every close runs,
    // then the first error is thrown.
    const results = await Promise.allSettled(
      all.map((thread) => closeThread(thread)),
    )
    if ('create' in driver) await driver.close?.()
    const failed = results.find((result) => result.status === 'rejected')
    if (failed) throw failed.reason
  }

  const tools: [ComputerTool] | [ComputerTool, NavigateTool] =
    capabilities.navigate ? [computer, navigate] : [computer]

  return { tools, middleware, interrupt: computerSafetyCheck, close }
}
