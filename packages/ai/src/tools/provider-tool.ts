import type { Tool } from '../types'

export interface ProviderTool<
  TProvider extends string,
  TKind extends string,
> extends Tool {
  readonly '~provider': TProvider
  readonly '~toolKind': TKind
}

export function brandProviderTool<T extends ProviderTool<string, string>>(
  tool: Omit<T, '~provider' | '~toolKind'>,
): T {
  return tool as T
}
