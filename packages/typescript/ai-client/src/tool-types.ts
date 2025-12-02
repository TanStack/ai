import type {
  AnyClientTool,
  InferToolInput,
  InferToolOutput,
} from '@tanstack/ai'

/**
 * Extract all tool names from a tools array as a union type
 */
export type ExtractToolNames<TTools extends ReadonlyArray<AnyClientTool>> =
  TTools[number]['name']

/**
 * Find a tool by name in the tools array
 */
type FindTool<
  TTools extends ReadonlyArray<AnyClientTool>,
  TName extends string,
> = Extract<TTools[number], { name: TName }>

/**
 * Extract the input type for a specific tool by name
 */
export type ExtractToolInput<
  TTools extends ReadonlyArray<AnyClientTool>,
  TName extends string,
> =
  TName extends ExtractToolNames<TTools>
    ? InferToolInput<FindTool<TTools, TName>>
    : any

/**
 * Extract the output type for a specific tool by name
 */
export type ExtractToolOutput<
  TTools extends ReadonlyArray<AnyClientTool>,
  TName extends string,
> =
  TName extends ExtractToolNames<TTools>
    ? InferToolOutput<FindTool<TTools, TName>>
    : any
