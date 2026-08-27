import type {
  AnyClientTool,
  InferToolInput,
  InferToolOutput,
} from '@tanstack/ai/client'

export type ExtractToolNames<TTools extends ReadonlyArray<AnyClientTool>> =
  TTools[number]['name']

type FindTool<
  TTools extends ReadonlyArray<AnyClientTool>,
  TName extends string,
> = Extract<TTools[number], { name: TName }>

export type ExtractToolInput<
  TTools extends ReadonlyArray<AnyClientTool>,
  TName extends string,
> =
  TName extends ExtractToolNames<TTools>
    ? InferToolInput<FindTool<TTools, TName>>
    : any

export type ExtractToolOutput<
  TTools extends ReadonlyArray<AnyClientTool>,
  TName extends string,
> =
  TName extends ExtractToolNames<TTools>
    ? InferToolOutput<FindTool<TTools, TName>>
    : any
