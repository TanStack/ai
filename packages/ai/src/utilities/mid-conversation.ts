import type {
  MidConversationChange,
  MidConversationChanges,
  ModelMessage,
} from '../types'

/**
 * FNV-1a 32-bit over the UTF-16 code units of `content`, as 8 lowercase hex
 * characters. A short, stable id for one system prompt.
 */
export function promptHash(content: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export interface MidConversationPlan {
  changes: MidConversationChanges
  /** The record to save on the first assistant message of this call, if any. */
  record?: MidConversationChange
}

/** The state after the records: the changes, and every recorded name and hash. */
interface FoldedRecords {
  changes: MidConversationChanges
  tools: Array<string>
  prompts: Array<string>
}

function foldRecords(
  messages: ReadonlyArray<ModelMessage>,
): FoldedRecords | undefined {
  let folded: FoldedRecords | undefined
  for (let before = 0; before < messages.length; before++) {
    const message = messages[before]
    const record =
      message?.role === 'assistant' ? message.midConversationChange : undefined
    if (!record) continue
    const prompts = record.systemPrompts ?? []
    if (record.tools) {
      folded = {
        changes: {
          start: { tools: [...record.tools], systemPrompts: prompts.length },
          changes: [],
        },
        tools: [...record.tools],
        prompts: [...prompts],
      }
      continue
    }
    // A change before any start point is ignored. Compaction can cause it.
    if (!folded) continue
    const added = record.toolsAdded ?? []
    folded.tools.push(...added)
    folded.prompts.push(...prompts)
    folded.changes.changes.push({
      before,
      ...(added.length > 0 && { tools: [...added] }),
      ...(prompts.length > 0 && { systemPrompts: prompts.length }),
    })
  }
  return folded
}

/**
 * Fold the records in `messages`, compare them with the tools and prompts of
 * this call, and decide. A change is additive when every recorded tool is
 * still there, the prompts start with the recorded prompts, and the start
 * point has a tool or no tool was added. Anything else is a new start point.
 * Pure.
 */
export function planMidConversationChanges(input: {
  messages: ReadonlyArray<ModelMessage>
  toolNames: ReadonlyArray<string>
  /** The normalized content of each system prompt, in order. */
  systemPrompts: ReadonlyArray<string>
}): MidConversationPlan {
  const tools = [...input.toolNames]
  const prompts = input.systemPrompts.map((prompt) => promptHash(prompt))
  const startPoint: MidConversationPlan = {
    changes: { start: { tools, systemPrompts: prompts.length }, changes: [] },
    record: { tools: [...tools], systemPrompts: prompts },
  }
  const folded = foldRecords(input.messages)
  if (!folded) return startPoint

  const toolsAdded = tools.filter((name) => !folded.tools.includes(name))
  const promptsAdded = prompts.slice(folded.prompts.length)
  const isAdditive =
    folded.tools.every((name) => tools.includes(name)) &&
    folded.prompts.every((hash, index) => prompts[index] === hash) &&
    (folded.changes.start.tools.length > 0 || toolsAdded.length === 0)
  if (!isAdditive) return startPoint
  if (toolsAdded.length === 0 && promptsAdded.length === 0) {
    return { changes: folded.changes }
  }
  folded.changes.changes.push({
    before: input.messages.length,
    ...(toolsAdded.length > 0 && { tools: toolsAdded }),
    ...(promptsAdded.length > 0 && { systemPrompts: promptsAdded.length }),
  })
  return {
    changes: folded.changes,
    record: {
      ...(toolsAdded.length > 0 && { toolsAdded: [...toolsAdded] }),
      ...(promptsAdded.length > 0 && { systemPrompts: promptsAdded }),
    },
  }
}

export interface MidConversationRequest<TTool, TPrompt> {
  startTools: Array<TTool>
  startSystemPrompts: Array<TPrompt>
  /** Every added tool, in change order. */
  addedTools: Array<TTool>
  /** The changes by message index (`before`). */
  at: Map<number, { tools: Array<TTool>; systemPrompts: Array<TPrompt> }>
}

/**
 * For adapters: resolve the names and counts of `changes` against the current
 * `tools` and `systemPrompts`. Returns `undefined` when a name is missing, a
 * name is used twice, or the counts do not add up. Then the adapter sends the
 * request it sends today.
 */
export function splitMidConversationChanges<
  TTool extends { name: string },
  TPrompt,
>(input: {
  changes: MidConversationChanges
  tools: ReadonlyArray<TTool>
  systemPrompts: ReadonlyArray<TPrompt>
}): MidConversationRequest<TTool, TPrompt> | undefined {
  const { changes, tools, systemPrompts } = input
  const byName = new Map(tools.map((tool) => [tool.name, tool] as const))
  const used = new Set<string>()
  const pick = (names: ReadonlyArray<string>) => {
    const picked: Array<TTool> = []
    for (const name of names) {
      const tool = byName.get(name)
      if (!tool || used.has(name)) return undefined
      used.add(name)
      picked.push(tool)
    }
    return picked
  }

  const startTools = pick(changes.start.tools)
  let offset = changes.start.systemPrompts
  if (!startTools || offset > systemPrompts.length) return undefined
  const request: MidConversationRequest<TTool, TPrompt> = {
    startTools,
    startSystemPrompts: systemPrompts.slice(0, offset),
    addedTools: [],
    at: new Map(),
  }
  for (const change of changes.changes) {
    const added = pick(change.tools ?? [])
    const count = change.systemPrompts ?? 0
    if (
      !added ||
      offset + count > systemPrompts.length ||
      request.at.has(change.before)
    ) {
      return undefined
    }
    request.addedTools.push(...added)
    request.at.set(change.before, {
      tools: added,
      systemPrompts: systemPrompts.slice(offset, offset + count),
    })
    offset += count
  }
  // Every current tool and prompt must have its place.
  if (used.size !== tools.length || offset !== systemPrompts.length) {
    return undefined
  }
  return request
}
