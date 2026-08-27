import type { Tool } from '../../../types'

export class DuplicateToolNameError extends Error {
  readonly toolName: string

  constructor(toolName: string, message: string) {
    super(message)
    this.name = 'DuplicateToolNameError'
    this.toolName = toolName
  }
}

function isProviderNativeTool(tool: Tool): boolean {
  const kind = tool.metadata?.['__kind']
  return typeof kind === 'string' && kind.length > 0
}

function nativeAndCustomMessage(toolName: string) {
  return [
    `Cannot pass two tools named "${toolName}" in the same chat() call.`,
    `One is the provider-native tool from a factory (for example webSearchTool()).`,
    `The other is your own function with the same public name.`,
    `Tool names in one tools array must be unique.`,
    `Keep the factory for hosted search, or keep your function and give it a different name.`,
  ].join(' ')
}

function duplicateNameMessage(toolName: string) {
  return [
    `Cannot pass two tools named "${toolName}" in the same chat() call.`,
    `Tool names in one tools array must be unique.`,
  ].join(' ')
}

export function assertUniqueToolNames(tools: ReadonlyArray<Tool>): void {
  const byName = new Map<string, Array<Tool>>()
  for (const tool of tools) {
    const group = byName.get(tool.name)
    if (group) {
      group.push(tool)
    } else {
      byName.set(tool.name, [tool])
    }
  }

  for (const [name, group] of byName) {
    if (group.length < 2) {
      continue
    }
    const hasNative = group.some(isProviderNativeTool)
    const hasCustom = group.some((tool) => !isProviderNativeTool(tool))
    throw new DuplicateToolNameError(
      name,
      hasNative && hasCustom
        ? nativeAndCustomMessage(name)
        : duplicateNameMessage(name),
    )
  }
}
