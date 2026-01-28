import { lazy } from 'solid-js'
import { constructCoreClass } from '@tanstack/devtools-utils/solid'

export interface AiDevtoolsInit {}

// Runtime check for SSR environments
const isServer = typeof window === 'undefined'

// Server-safe no-op classes for SSR fallback
class ServerNoOpCore {
  constructor() {}
  async mount<T extends HTMLElement>(
    _el: T,
    _theme: 'light' | 'dark',
  ): Promise<void> {}
  unmount(): void {}
}

let AiDevtoolsCore: ReturnType<typeof constructCoreClass>[0]
let AiDevtoolsCoreNoOp: ReturnType<typeof constructCoreClass>[1]

if (isServer) {
  // SSR fallback - use no-op classes to avoid solid-js/web client-only APIs
  // This is a fallback for bundlers that don't respect export conditions
  AiDevtoolsCore = ServerNoOpCore as unknown as ReturnType<
    typeof constructCoreClass
  >[0]
  AiDevtoolsCoreNoOp = ServerNoOpCore as unknown as ReturnType<
    typeof constructCoreClass
  >[1]
} else {
  // Browser environment - use the real implementation
  const Component = lazy(() => import('./components/Shell'))
  const [Core, NoOp] = constructCoreClass(Component)
  AiDevtoolsCore = Core
  AiDevtoolsCoreNoOp = NoOp
}

export { AiDevtoolsCore, AiDevtoolsCoreNoOp }
