/**
 * Server-side stub for Solid AI Devtools.
 * This module provides no-op implementations that are safe to import in SSR environments.
 */

import type { Component } from 'solid-js'

export interface AiDevtoolsSolidInit {
  buttonPosition?:
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'
    | 'relative'
  initialIsOpen?: boolean
  errorTypes?: Array<string>
  styleNonce?: string
  shadowDOMTarget?: ShadowRoot
}

/**
 * No-op AiDevtools component for server-side rendering.
 */
export const AiDevtools: Component<AiDevtoolsSolidInit> = () => null

/**
 * No-op aiDevtoolsPlugin for server-side rendering.
 */
export const aiDevtoolsPlugin = {
  name: 'TanStack AI',
  id: 'tanstack-ai',
  defaultOpen: true,
  component: () => null,
}
