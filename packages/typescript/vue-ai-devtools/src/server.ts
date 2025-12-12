import { defineComponent } from 'vue'

export interface AiDevtoolsVueInit {
  theme?: 'light' | 'dark'
}

const NullComponent = /* #__PURE__ */ defineComponent({
  name: 'NullAiDevtoolsPanel',
  setup() {
    return () => null
  },
})

// On the server/SSR, devtools are always a no-op.
export const AiDevtoolsPanel = NullComponent
export const AiDevtoolsPanelInProd = NullComponent

export function aiDevtoolsPlugin(_props: AiDevtoolsVueInit = {}) {
  return {
    id: 'tanstack-ai',
    name: 'TanStack AI',
    component: NullComponent,
    props: _props,
  }
}

export const aiDevtoolsNoOpPlugin = aiDevtoolsPlugin
