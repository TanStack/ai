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
