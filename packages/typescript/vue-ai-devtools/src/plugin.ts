import { defineComponent } from 'vue'
import { AiDevtoolsPanel } from './AiDevtoolsPanel'
import type { AiDevtoolsVueInit } from './AiDevtoolsPanel'

const NullComponent = /* #__PURE__ */ defineComponent({
  name: 'NullAiDevtoolsPlugin',
  setup() {
    return () => null
  },
})

/**
 * Create a TanStack Devtools Vue plugin for TanStack AI.
 * Matches the shape expected by `@tanstack/vue-devtools`.
 */
export function aiDevtoolsPlugin(props: AiDevtoolsVueInit = {}) {
  return {
    id: 'tanstack-ai',
    name: 'TanStack AI',
    component: AiDevtoolsPanel,
    props,
  }
}

export function aiDevtoolsNoOpPlugin(props: AiDevtoolsVueInit = {}) {
  return {
    id: 'tanstack-ai',
    name: 'TanStack AI',
    component: NullComponent,
    props,
  }
}
