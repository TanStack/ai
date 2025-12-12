import { AiDevtoolsPanelInProd } from './AiDevtoolsPanelInProd'
import type { AiDevtoolsVueInit } from './AiDevtoolsPanel'

export { AiDevtoolsPanelInProd as AiDevtoolsPanel } from './AiDevtoolsPanelInProd'
export type { AiDevtoolsVueInit } from './AiDevtoolsPanel'

/**
 * Production entry: always-on plugin/panel (mirrors `@tanstack/*-ai-devtools/production`).
 */
export function aiDevtoolsPlugin(props: AiDevtoolsVueInit = {}) {
  return {
    id: 'tanstack-ai',
    name: 'TanStack AI',
    component: AiDevtoolsPanelInProd,
    props,
  }
}
