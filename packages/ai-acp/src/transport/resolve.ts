import type { SandboxHandle } from '@tanstack/ai-sandbox'
import type { AcpTransportPreference } from './types'

/**
 * Pick stdio vs WebSocket for ACP based on sandbox capabilities and caller
 * preference.
 */
export function resolveAcpTransportMode(
  sandbox: SandboxHandle,
  preference: AcpTransportPreference = 'auto',
): 'stdio' | 'websocket' {
  if (preference === 'stdio') {
    if (sandbox.capabilities.writableStdin !== true) {
      throw new Error(
        `${sandbox.provider}: ACP stdio transport requires capabilities.writableStdin, but this sandbox cannot write to process stdin. Use transport: 'websocket' or 'auto'.`,
      )
    }
    return 'stdio'
  }

  if (preference === 'websocket') {
    if (sandbox.capabilities.ports !== true) {
      throw new Error(
        `${sandbox.provider}: ACP WebSocket transport requires capabilities.ports so the harness server can be reached from the orchestrator.`,
      )
    }
    if (sandbox.capabilities.backgroundProcesses !== true) {
      throw new Error(
        `${sandbox.provider}: ACP WebSocket transport requires capabilities.backgroundProcesses to run the in-sandbox harness server.`,
      )
    }
    return 'websocket'
  }

  if (sandbox.capabilities.writableStdin === true) return 'stdio'
  if (
    sandbox.capabilities.ports === true &&
    sandbox.capabilities.backgroundProcesses === true
  ) {
    return 'websocket'
  }

  throw new Error(
    `${sandbox.provider}: cannot run ACP — no writable stdin and no port-exposed background-process support. Use a Docker/local-process sandbox or enable ports on the provider.`,
  )
}
