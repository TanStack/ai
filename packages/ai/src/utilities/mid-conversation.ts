import type { MidConversationChanges } from '../types'

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
