import { brandProviderTool } from '@tanstack/ai'
import { getComputerUseToolMetadata } from '@tanstack/ai/adapter-internals'
import { ANTHROPIC_MODEL_TOOLS } from '../model-meta'
import { getAnthropicProviderToolMetadata } from './anthropic-provider-tool'
import type { ComputerUseToolMetadata } from '@tanstack/ai/adapter-internals'
import type {
  BetaComputerToolset20260801,
  BetaToolComputerUse20241022,
  BetaToolComputerUse20250124,
  BetaToolComputerUse20251124,
} from '@anthropic-ai/sdk/resources/beta'
import type { ProviderTool, Tool } from '@tanstack/ai'

/** The single `computer` tool that sends its action in `input.action`. */
export type ComputerUseSingleToolConfig =
  | BetaToolComputerUse20241022
  | BetaToolComputerUse20250124
  | BetaToolComputerUse20251124

/**
 * The computer toolset: one entry with no name. The model calls each action
 * as its own tool (`left_click`, `screenshot`, …).
 */
export type ComputerToolsetConfig = BetaComputerToolset20260801

export type ComputerUseToolConfig =
  | ComputerUseSingleToolConfig
  | ComputerToolsetConfig

/** @deprecated Renamed to `ComputerUseToolConfig`. Will be removed in a future release. */
export type ComputerUseTool = ComputerUseToolConfig

/** `computer_20241022` or `computer_20250124`. */
export type AnthropicComputerUseTool = ProviderTool<'anthropic', 'computer_use'>

/** `computer_20251124`. */
export type AnthropicComputerUse20251124Tool = ProviderTool<
  'anthropic',
  'computer_use_20251124'
>

/** `computer_toolset_20260801`. */
export type AnthropicComputerToolset = ProviderTool<
  'anthropic',
  'computer_toolset'
>

/** The name of the tool that every computer use version runs as. */
export const COMPUTER_TOOL_NAME = 'computer'

export function convertComputerUseToolToAdapterFormat(
  tool: Tool,
): ComputerUseToolConfig {
  const metadata = getAnthropicProviderToolMetadata(
    tool,
  ) as ComputerUseToolConfig
  return metadata
}

/** True for the `computer_toolset_20260801` entry. */
export function isComputerToolset(tool: Tool) {
  return tool.metadata?.['type'] === 'computer_toolset_20260801'
}

/**
 * One toolset call (`left_click` with `{ coordinate }`) as one `computer`
 * call: `{ action: 'left_click', coordinate }`. So one `execute` works for
 * every version.
 */
export function joinComputerToolsetCall(member: string, input: object) {
  return { action: member, ...input }
}

/** A `computer` call as the toolset call that the model sent. */
export function splitComputerToolsetCall(input: object) {
  if (!('action' in input) || typeof input.action !== 'string') {
    return undefined
  }
  const { action, ...memberInput } = input
  return { name: action, input: memberInput }
}

/**
 * Computer use. Every version runs as one tool named `computer`, with the
 * action in `input.action`:
 *
 * - `computer_toolset_20260801`: Claude Opus 5.5, Sonnet 5.5, Haiku 5.5, and
 *   the other models that support the toolset. No beta header.
 * - `computer_20251124`: the earlier tool of Claude Opus 4.5 to Claude Opus 5,
 *   Sonnet 4.6, and Sonnet 5.
 * - `computer_20250124`: Claude Sonnet 4.5, Haiku 4.5, and Opus 4.1.
 */
export function computerUseTool(
  config: ComputerToolsetConfig,
): AnthropicComputerToolset
export function computerUseTool(
  config: BetaToolComputerUse20251124,
): AnthropicComputerUse20251124Tool
export function computerUseTool(
  config: BetaToolComputerUse20241022 | BetaToolComputerUse20250124,
): AnthropicComputerUseTool
export function computerUseTool(config: ComputerUseToolConfig) {
  return brandProviderTool<
    | AnthropicComputerToolset
    | AnthropicComputerUse20251124Tool
    | AnthropicComputerUseTool
  >({
    name: COMPUTER_TOOL_NAME,
    description: '',
    // Every version has the same runtime kind. The type kind picks the
    // models that accept it.
    metadata: { ...config, __kind: 'anthropic.computer_use' },
  })
}

/** The native tool for the newest computer version in the model's kinds. */
function nativeComputerTool(
  { display, capabilities }: ComputerUseToolMetadata,
  kinds: ReadonlyArray<string>,
) {
  if (kinds.includes('computer_toolset')) {
    // The toolset type has no display size field.
    return computerUseTool({
      type: 'computer_toolset_20260801',
      configs: {
        zoom: { enabled: capabilities.zoom },
        cursor_position: { enabled: capabilities.cursorPosition },
      },
    })
  }
  const size = {
    display_width_px: display.width,
    display_height_px: display.height,
  }
  if (kinds.includes('computer_use_20251124')) {
    return computerUseTool({
      type: 'computer_20251124',
      name: COMPUTER_TOOL_NAME,
      ...size,
      enable_zoom: capabilities.zoom,
    })
  }
  if (kinds.includes('computer_use')) {
    return computerUseTool({
      type: 'computer_20250124',
      name: COMPUTER_TOOL_NAME,
      ...size,
    })
  }
  return undefined
}

/**
 * Turn the generic computer tool from `@tanstack/ai-computer-use` into the
 * native computer tool of the model. The tool keeps its name `computer` and
 * its `execute`. Every other tool comes back unchanged.
 *
 * The version is the newest one in the model meta: `computer_toolset_20260801`,
 * then `computer_20251124`, then `computer_20250124`.
 *
 * @param tool - A tool from the chat tool list.
 * @param model - The Anthropic model id of the request.
 * @throws Error when the model has no computer version, or the model id is
 *   not in the model meta.
 */
export function resolveComputerUseTool(tool: Tool, model: string) {
  const computer = getComputerUseToolMetadata(tool)
  if (!computer) return tool
  const native = nativeComputerTool(
    computer,
    ANTHROPIC_MODEL_TOOLS[model] ?? [],
  )
  if (!native) {
    throw new Error(`Model "${model}" does not support computer use.`)
  }
  return { ...tool, metadata: native.metadata }
}
