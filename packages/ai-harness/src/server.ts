// The `@tanstack/ai-harness/server` entry: the HTTP and WebSocket transport,
// and the protocol helpers that a custom transport uses.
export { createHarnessHandler, handleHarnessSocket, requestUsers } from './http'
export type {
  HarnessHandlerOptions,
  HarnessSocketOptions,
  OpenAccess,
} from './http'
export type { HarnessStreamOptions } from './sse'

export {
  HARNESS_PROTOCOL_VERSION,
  applyInput,
  capabilitiesOf,
  parseControlFrame,
  parseHarnessInput,
} from './protocol'
export type { ControlFrame, HarnessErrorCode, HostFrame } from './protocol'
