import type { Tool } from '../types'

/**
 * Metadata that marks a tool as a portable computer-use tool. Adapters read
 * it to map the tool to their native computer-use format.
 */
export interface ComputerUseToolMetadata {
  __kind: 'computer_use'
  display: { width: number; height: number }
  environment: 'browser' | 'linux' | 'mac' | 'windows'
  capabilities: { zoom: boolean; cursorPosition: boolean }
}

const ENVIRONMENTS: ReadonlyArray<unknown> = [
  'browser',
  'linux',
  'mac',
  'windows',
]

function isEnvironment(
  value: unknown,
): value is ComputerUseToolMetadata['environment'] {
  return ENVIRONMENTS.includes(value)
}

/**
 * Read the portable computer-use metadata from a tool.
 *
 * Native provider tools use namespaced kinds (for example
 * `anthropic.computer_use`), so they return `undefined`.
 *
 * @param tool - Any tool from the chat tool list.
 * @returns The metadata, or `undefined` when the tool is not a portable
 *   computer-use tool.
 */
export function getComputerUseToolMetadata(
  tool: Tool,
): ComputerUseToolMetadata | undefined {
  const metadata = tool.metadata
  if (metadata?.['__kind'] !== 'computer_use') return undefined
  const { display, environment, capabilities } = metadata
  const isValid =
    typeof display?.width === 'number' &&
    typeof display?.height === 'number' &&
    isEnvironment(environment) &&
    typeof capabilities?.zoom === 'boolean' &&
    typeof capabilities?.cursorPosition === 'boolean'
  if (!isValid) return undefined
  return {
    __kind: 'computer_use',
    display: { width: display.width, height: display.height },
    environment,
    capabilities: {
      zoom: capabilities.zoom,
      cursorPosition: capabilities.cursorPosition,
    },
  }
}
