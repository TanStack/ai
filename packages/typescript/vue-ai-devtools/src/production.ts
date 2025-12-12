export { AiDevtoolsPanelInProd as AiDevtoolsPanel } from './AiDevtoolsPanelInProd'
export type { AiDevtoolsVueInit } from './AiDevtoolsPanel'

import type { AiDevtoolsVueInit } from './AiDevtoolsPanel'
import { AiDevtoolsPanelInProd } from './AiDevtoolsPanelInProd'

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
