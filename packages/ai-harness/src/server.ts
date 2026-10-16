// The `@tanstack/ai-harness/server` entry: the HTTP and WebSocket transport,
// and the protocol helpers that a custom transport uses.
export { createHarnessHandler, handleHarnessSocket } from './http'
export type {
  Authorize,
  CanAccess,
  HarnessHandlerOptions,
  HarnessSocketOptions,
} from './http'

export {
  HARNESS_PROTOCOL_VERSION,
  applyInput,
  capabilitiesOf,
  parseControlFrame,
  parseHarnessInput,
} from './protocol'
export type { ControlFrame, HostFrame } from './protocol'
