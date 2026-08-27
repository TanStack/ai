import type { CapabilityHandle } from './capabilities'
import type { AnyChatMiddleware } from './types'

/** Minimal adapter shape needed for capability validation. */
interface CapabilityRequiringAdapter {
  name: string
  requires?: ReadonlyArray<CapabilityHandle>
}

export function validateCapabilities(
  middlewares: ReadonlyArray<AnyChatMiddleware>,
  adapter: CapabilityRequiringAdapter,
): void {
  const provided = new Set<CapabilityHandle>()
  for (const mw of middlewares) {
    for (const handle of mw.provides ?? []) provided.add(handle)
  }

  const providedNames = (): string => {
    const names = [...provided].map((h) => h.capabilityName)
    return names.length ? names.join(', ') : 'none'
  }

  for (const handle of adapter.requires ?? []) {
    if (!provided.has(handle)) {
      throw new Error(
        `Adapter "${adapter.name}" requires capability "${handle.capabilityName}". ` +
          `Provided capabilities: ${providedNames()}. ` +
          `Add a middleware that provides "${handle.capabilityName}".`,
      )
    }
  }

  for (const mw of middlewares) {
    for (const handle of mw.requires ?? []) {
      if (!provided.has(handle)) {
        throw new Error(
          `Middleware "${mw.name ?? 'unnamed'}" requires capability ` +
            `"${handle.capabilityName}". Provided capabilities: ${providedNames()}. ` +
            `Add a middleware that provides "${handle.capabilityName}".`,
        )
      }
    }
  }
}
