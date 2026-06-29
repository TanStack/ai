import { EventType } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/** Harness-native tool names surfaced in Grok `thought` narration. */
export const GROK_NATIVE_TOOL_NAMES = [
  'run_terminal_command',
  'get_command_or_subagent_output',
  'tanstackStartRecipe',
  'exposePreview',
  'expose_preview',
] as const

type NativeToolName = (typeof GROK_NATIVE_TOOL_NAMES)[number]

const TOOL_ENTRY_PATTERNS: Array<{ re: RegExp; name: NativeToolName }> = [
  { re: /For\s+tanstackStartRecipe/i, name: 'tanstackStartRecipe' },
  { re: /\bmcp__tanstack__\w+/i, name: 'tanstackStartRecipe' },
  { re: /`tanstackStartRecipe`/i, name: 'tanstackStartRecipe' },
  { re: /\btanstackStartRecipe\b/i, name: 'tanstackStartRecipe' },
  { re: /`exposePreview`/i, name: 'exposePreview' },
  { re: /`expose_preview`/i, name: 'expose_preview' },
  { re: /\bexposePreview\b/i, name: 'exposePreview' },
  { re: /`run_terminal_command`/i, name: 'run_terminal_command' },
  { re: /Use\s+run_terminal_command/i, name: 'run_terminal_command' },
  { re: /\brun_terminal_command\b/i, name: 'run_terminal_command' },
  {
    re: /`get_command_or_subagent_output`/i,
    name: 'get_command_or_subagent_output',
  },
  {
    re: /get_command_or_subagent_output/i,
    name: 'get_command_or_subagent_output',
  },
  {
    re: /`(?:npx|pnpm|npm|ls|cd|mkdir|git|curl|node|bash|sh)\b[^`]*`/i,
    name: 'run_terminal_command',
  },
  { re: /\bnpx\s+--yes\b/i, name: 'run_terminal_command' },
  { re: /\bpnpm\s+(?:dev|install)\b/i, name: 'run_terminal_command' },
  { re: /\bnpm run dev\b/i, name: 'run_terminal_command' },
  { re: /running in background/i, name: 'get_command_or_subagent_output' },
  { re: /\bStill installing\b/i, name: 'run_terminal_command' },
  {
    re: /poll(?:ing)?(?:\s+again|\s+the|\s+for|\s+with)/i,
    name: 'get_command_or_subagent_output',
  },
  {
    re: /\b(?:command (?:ran|completed|finished|succeeded)|ran successfully)\b/i,
    name: 'run_terminal_command',
  },
]

/** Distinct literals we must not split across token boundaries when flushing planning. */
const HOLD_LITERALS = [
  'run_terminal_command',
  'get_command_or_subagent_output',
  'tanstackStartRecipe',
  'exposePreview',
  'expose_preview',
  'mcp__tanstack__',
  'Use run_terminal_command',
  'For tanstackStartRecipe',
  'command ran',
  'ran successfully',
  'Still installing',
  'running in background',
  'npx --yes',
  'pnpm dev',
  'pnpm install',
  'npm run dev',
]

export function findEarliestToolEntry(
  buffer: string,
  fromIndex = 0,
): { index: number; name: NativeToolName } | null {
  let best: { index: number; name: NativeToolName } | null = null
  for (const { re, name } of TOOL_ENTRY_PATTERNS) {
    const slice = buffer.slice(fromIndex)
    const match = re.exec(slice)
    if (!match) continue
    const index = fromIndex + match.index
    if (!best || index < best.index) best = { index, name }
  }
  return best
}

/**
 * How many trailing characters in `tail` must be held back because they may be
 * the prefix of a tool-entry literal still streaming in.
 */
export function planningHoldback(tail: string): number {
  let hold = 0
  for (const literal of HOLD_LITERALS) {
    for (let n = 1; n < literal.length; n++) {
      if (literal.startsWith(tail.slice(-n))) {
        hold = Math.max(hold, n)
      }
    }
  }

  const lastTick = tail.lastIndexOf('`')
  if (lastTick !== -1) {
    const ticksAfter = (tail.slice(lastTick).match(/`/g) ?? []).length
    if (ticksAfter % 2 === 1) {
      hold = Math.max(hold, tail.length - lastTick)
    }
  }

  return Math.min(hold, tail.length)
}

export function extractBacktickCommand(text: string): string | undefined {
  const match = text.match(/`([^`]+)`/)
  return match?.[1]?.trim()
}

function isShellCommand(value: string): boolean {
  return /^(?:npx|pnpm|npm|ls|cd|mkdir|git|curl|node|bash|sh)\b/i.test(value)
}

function resolveToolAt(
  index: number,
  name: NativeToolName,
  buffer: string,
): { name: NativeToolName; command?: string } {
  const slice = buffer.slice(index)
  const backtick = slice.match(/^`([^`]+)`/)
  if (backtick?.[1] !== undefined) {
    const inner = backtick[1].trim()
    if ((GROK_NATIVE_TOOL_NAMES as readonly string[]).includes(inner)) {
      return { name: inner as NativeToolName }
    }
    if (isShellCommand(inner)) {
      return { name: 'run_terminal_command', command: inner }
    }
  }

  const command = extractBacktickCommand(slice)
  if (
    command !== undefined &&
    name === 'run_terminal_command' &&
    isShellCommand(command)
  ) {
    return { name, command }
  }

  return { name }
}

interface ThoughtRouterContext {
  model: string
  genId: () => string
  now: () => number
}

/**
 * Incrementally split Grok `thought` deltas into AG-UI reasoning vs tool-call
 * chunks. Grok's streaming-json format narrates tool execution inside
 * `thought` — this router reclassifies that narration before it reaches the UI.
 */
export class GrokThoughtRouter {
  private buffer = ''
  private cursor = 0
  private mode: 'planning' | 'tool' = 'planning'
  private reasoningId: string | null = null
  private reasoningOpen = false
  private activeTool: {
    id: string
    name: string
    opened: boolean
    command?: string
  } | null = null

  constructor(private readonly ctx: ThoughtRouterContext) {}

  private *ensureReasoning(): Generator<StreamChunk> {
    if (this.reasoningOpen) return
    this.reasoningId = this.ctx.genId()
    this.reasoningOpen = true
    yield {
      type: EventType.REASONING_START,
      messageId: this.reasoningId,
      model: this.ctx.model,
      timestamp: this.ctx.now(),
    }
    yield {
      type: EventType.REASONING_MESSAGE_START,
      messageId: this.reasoningId,
      role: 'reasoning',
      model: this.ctx.model,
      timestamp: this.ctx.now(),
    }
  }

  private *closeReasoning(): Generator<StreamChunk> {
    if (!this.reasoningOpen || this.reasoningId === null) return
    yield {
      type: EventType.REASONING_MESSAGE_END,
      messageId: this.reasoningId,
      model: this.ctx.model,
      timestamp: this.ctx.now(),
    }
    yield {
      type: EventType.REASONING_END,
      messageId: this.reasoningId,
      model: this.ctx.model,
      timestamp: this.ctx.now(),
    }
    this.reasoningOpen = false
    this.reasoningId = null
  }

  private *emitPlanning(text: string): Generator<StreamChunk> {
    if (!text) return
    yield* this.ensureReasoning()
    yield {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: this.reasoningId!,
      delta: text,
      model: this.ctx.model,
      timestamp: this.ctx.now(),
    }
  }

  private *openActiveTool(): Generator<StreamChunk> {
    const tool = this.activeTool
    if (!tool || tool.opened) return
    tool.opened = true
    const input: Record<string, unknown> = {}
    if (tool.command) input.command = tool.command

    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: tool.id,
      toolCallName: tool.name,
      toolName: tool.name,
      model: this.ctx.model,
      timestamp: this.ctx.now(),
    }
    if (tool.command) {
      const args = JSON.stringify(input, null, 2)
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: tool.id,
        model: this.ctx.model,
        timestamp: this.ctx.now(),
        delta: args,
        args,
      }
    }
  }

  private *closeActiveTool(narration: string): Generator<StreamChunk> {
    const tool = this.activeTool
    if (!tool) return

    yield* this.openActiveTool()

    const status = narration.trim()
    if (status && !tool.command) {
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: tool.id,
        model: this.ctx.model,
        timestamp: this.ctx.now(),
        delta: status,
      }
    } else if (status && tool.command && !status.includes(tool.command)) {
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: tool.id,
        model: this.ctx.model,
        timestamp: this.ctx.now(),
        delta: `\n${status}`,
      }
    }

    const input: Record<string, unknown> = {}
    if (tool.command) input.command = tool.command
    if (status) input.activity = status

    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId: tool.id,
      toolCallName: tool.name,
      toolName: tool.name,
      model: this.ctx.model,
      timestamp: this.ctx.now(),
      input,
    }
    yield {
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: tool.id,
      messageId: this.ctx.genId(),
      model: this.ctx.model,
      timestamp: this.ctx.now(),
      content: status || JSON.stringify(input),
    }

    this.activeTool = null
    this.mode = 'planning'
  }

  private *startToolAt(
    index: number,
    name: NativeToolName,
  ): Generator<StreamChunk> {
    yield* this.closeReasoning()
    this.mode = 'tool'
    const resolved = resolveToolAt(index, name, this.buffer)
    this.activeTool = {
      id: this.ctx.genId(),
      name: resolved.name,
      opened: false,
      ...(resolved.command !== undefined && { command: resolved.command }),
    }
    this.cursor = index
  }

  private *drainPlanning(): Generator<StreamChunk> {
    while (this.cursor < this.buffer.length) {
      const entry = findEarliestToolEntry(this.buffer, this.cursor)
      if (!entry) {
        const tail = this.buffer.slice(this.cursor)
        const hold = planningHoldback(tail)
        const emitEnd = this.buffer.length - hold
        if (emitEnd > this.cursor) {
          yield* this.emitPlanning(this.buffer.slice(this.cursor, emitEnd))
          this.cursor = emitEnd
        }
        break
      }
      if (entry.index > this.cursor) {
        yield* this.emitPlanning(this.buffer.slice(this.cursor, entry.index))
        this.cursor = entry.index
      }
      yield* this.startToolAt(entry.index, entry.name)
      return
    }
  }

  *push(delta: string): Generator<StreamChunk> {
    if (!delta) return
    this.buffer += delta

    while (this.cursor < this.buffer.length) {
      if (this.mode === 'planning') {
        yield* this.drainPlanning()
        if (this.mode === 'planning') break
        continue
      }

      const tool = this.activeTool
      if (!tool) {
        this.mode = 'planning'
        continue
      }

      const next = findEarliestToolEntry(this.buffer, this.cursor + 1)
      const minToolSpan = 12
      if (
        next &&
        next.index > this.cursor + minToolSpan &&
        (next.name !== tool.name || next.index > this.cursor + 40)
      ) {
        const narration = this.buffer.slice(this.cursor, next.index)
        yield* this.closeActiveTool(narration)
        yield* this.startToolAt(next.index, next.name)
        continue
      }

      const narration = this.buffer.slice(this.cursor)
      yield* this.openActiveTool()
      const tail =
        tool.command && narration.startsWith(tool.command)
          ? narration.slice(tool.command.length)
          : narration
      if (tail) {
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: tool.id,
          model: this.ctx.model,
          timestamp: this.ctx.now(),
          delta: tail,
        }
      }
      this.cursor = this.buffer.length
      break
    }
  }

  *finalize(): Generator<StreamChunk> {
    if (this.mode === 'planning' && this.cursor < this.buffer.length) {
      const entry = findEarliestToolEntry(this.buffer, this.cursor)
      if (entry) {
        if (entry.index > this.cursor) {
          yield* this.emitPlanning(this.buffer.slice(this.cursor, entry.index))
          this.cursor = entry.index
        }
        yield* this.startToolAt(entry.index, entry.name)
      } else {
        yield* this.emitPlanning(this.buffer.slice(this.cursor))
        this.cursor = this.buffer.length
      }
    }

    if (this.mode === 'tool' && this.activeTool) {
      yield* this.closeActiveTool(this.buffer.slice(this.cursor))
      this.cursor = this.buffer.length
    }
    yield* this.closeReasoning()
  }
}
