import type { ClientCapabilities } from '@modelcontextprotocol/client'
import { isRecord } from './value'

/**
 * MCP Events extension id from SEP-3415
 * (`modelcontextprotocol/modelcontextprotocol@2ec39b9`).
 *
 * @experimental
 */
export const MCP_EVENTS_EXTENSION = 'io.modelcontextprotocol/events'

/**
 * True when the server declares `extensions["io.modelcontextprotocol/events"]`.
 *
 * @experimental
 */
export function serverSupportsEvents(
  caps: Record<string, unknown> | undefined,
): boolean {
  const extensions = caps?.extensions
  return isRecord(extensions) && MCP_EVENTS_EXTENSION in extensions
}

/**
 * Merge the Events client capability into `capabilities.extensions`.
 *
 * @experimental
 */
export function withEventsClientCapability(
  caps?: ClientCapabilities,
): ClientCapabilities {
  return {
    ...caps,
    extensions: {
      ...caps?.extensions,
      [MCP_EVENTS_EXTENSION]: {},
    },
  }
}
