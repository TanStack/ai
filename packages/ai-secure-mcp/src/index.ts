// The envelope
export { createSecureMcpServer } from './server'
export type { SecureMcpConfig, SecureMcpServer } from './server'

// Auth + clients
export { hashToken, constantTimeEqual, bearerToken, verifyToken } from './auth'
export { clientsFromFile } from './clients-file'

// Egress
export { createEgress } from './egress'
export type { EgressFetch } from './egress'

// Two-phase approval
export { createApprovalStore } from './approval'
export type { ApprovalStore, ApprovalRequired } from './approval'

// Rate limiting
export { createRateLimiter } from './rate-limit'
export type { RateLimiter } from './rate-limit'

// Audit
export { createAuditLog, redactArgs } from './audit'
export type { AuditLog, AuditEntry } from './audit'

// Notifiers
export {
  ntfyNotifier,
  webhookNotifier,
  silentNotifier,
  debounceNotifier,
  describeEvent,
} from './notifier'

// Go-live
export { preflight, tailscaleCommand } from './deploy'
export type { PreflightInput, PreflightResult } from './deploy'

// Guard context (for typing a tool's ctx)
export type { SecureRequestContext } from './guard'

// Shared types
export { SecureMcpError } from './types'
export type {
  ErrorCode,
  ClientRecord,
  SecurityEvent,
  SecurityNotifier,
  AccessPolicy,
} from './types'
