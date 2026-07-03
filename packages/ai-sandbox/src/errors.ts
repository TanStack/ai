/**
 * Thrown when code invokes an optional sandbox capability that the active
 * provider does not support. Core/middleware should check
 * `handle.capabilities` BEFORE using an optional capability and degrade
 * gracefully; this error exists so that a direct call to an unsupported
 * optional method fails loud instead of silently no-opping.
 */
export class UnsupportedCapabilityError extends Error {
  readonly provider: string
  readonly capability: string

  constructor(provider: string, capability: string, hint?: string) {
    super(
      `Sandbox provider "${provider}" does not support the "${capability}" capability.` +
        (hint ? ` ${hint}` : ''),
    )
    this.name = 'UnsupportedCapabilityError'
    this.provider = provider
    this.capability = capability
  }
}

/** Thrown when a harness adapter requires a sandbox but none was provided. */
export class MissingSandboxError extends Error {
  constructor(adapterName: string) {
    super(
      `Adapter "${adapterName}" requires a sandbox. Add withSandbox(defineSandbox({ ... })) to chat() middleware.`,
    )
    this.name = 'MissingSandboxError'
  }
}
