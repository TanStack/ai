/**
 * Server-side stub for React AI Devtools.
 * This module provides no-op implementations that are safe to import in SSR environments.
 */

export interface AiDevtoolsReactInit {
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
 * No-op AiDevtoolsPanel component for server-side rendering.
 */
export const AiDevtoolsPanel = (): null => null

/**
 * No-op aiDevtoolsPlugin for server-side rendering.
 */
export const aiDevtoolsPlugin = {
  name: 'TanStack AI',
  id: 'tanstack-ai',
  defaultOpen: true,
  component: () => null,
}
