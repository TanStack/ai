// The wrapper: a signed snippet + manifest → a plain ServerTool.
export {
  sandboxedTool,
  UnauthorizedError,
  ScopeDeniedError,
} from './sandboxed-tool'

// Manifest: hashing, canonical-JSON signing (optional), keygen.
export {
  hashSnippet,
  canonicalize,
  signManifest,
  verifyManifest,
  generateManifestKeyPair,
} from './manifest'

// Limits + the injected-call counter.
export {
  intersectLimits,
  makeCallCounter,
  InjectedCallLimitError,
} from './limits'

// Result shaping.
export { byteLength, shapeResult, ResultTooLargeError } from './result'

// Capability set (exposed for custom wrappers/tests).
export {
  safeName,
  resolveAllowed,
  buildBindings,
  buildPrelude,
} from './capability'

// Authoring-time importer: plain snippet → unreviewed, deny-by-default manifest.
export { importSnippet, type ImportOptions } from './importer'

// Two-phase approval for Tier-3 writes.
export {
  createApprovalStore,
  ProposalExpiredError,
  type ApprovalStore,
  type Proposal,
} from './approval'

export type {
  AuthInfo,
  AuditEntry,
  ClientPolicy,
  Facade,
  FacadeContext,
  Facades,
  IsolateDriver,
  Limits,
  Manifest,
  SandboxedToolConfig,
  Tier,
  ToolBinding,
} from './types'
