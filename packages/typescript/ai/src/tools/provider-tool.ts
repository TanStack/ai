import type { Tool } from '../types'

/**
 * A provider-specific tool produced by an adapter-package factory
 * (e.g. `webSearchTool` from `@tanstack/ai-anthropic/tools`).
 *
 * The two `~`-prefixed fields are type-only phantom brands — they are never
 * assigned at runtime. They allow the core type system to match a factory's
 * output against the selected model's `supports.tools` list and surface a
 * compile-time error when the combination is unsupported.
 *
 * User-defined tools (via `toolDefinition()`) remain plain `Tool` and stay
 * assignable to any model.
 *
 * @template TProvider - Provider identifier (e.g. `'anthropic'`, `'openai'`).
 * @template TKind - Canonical tool-kind string matching the provider's
 *   `supports.tools` entries (e.g. `'web_search'`, `'code_execution'`).
 */
export interface ProviderTool<
  TProvider extends string,
  TKind extends string,
> extends Tool {
  readonly '~provider': TProvider
  readonly '~toolKind': TKind
}
