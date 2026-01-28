/**
 * Server-side stub for AiDevtoolsCore.
 * This module provides no-op implementations that are safe to import in SSR environments
 * without triggering client-only solid-js/web APIs.
 */

export interface AiDevtoolsInit {}

export class AiDevtoolsCore {
  constructor(_init?: AiDevtoolsInit) {}

  async mount<T extends HTMLElement>(_el: T, _theme: 'light' | 'dark'): Promise<void> {
    // No-op in server environment
  }

  unmount(): void {
    // No-op in server environment
  }
}

export class AiDevtoolsCoreNoOp extends AiDevtoolsCore {
  constructor(_init?: AiDevtoolsInit) {
    super(_init)
  }

  async mount<T extends HTMLElement>(_el: T, _theme: 'light' | 'dark'): Promise<void> {
    // No-op in server environment
  }

  unmount(): void {
    // No-op in server environment
  }
}
