import { defineComponent } from 'vue'
import { createVuePlugin } from '@tanstack/devtools-utils/vue'

export interface AiDevtoolsVueInit {
  theme?: 'light' | 'dark'
}

const NullComponent = /* #__PURE__ */ defineComponent({
  name: 'NullAiDevtoolsPanel',
  setup() {
    return () => null
  },
})

export const AiDevtoolsPanel = NullComponent
export const AiDevtoolsPanelInProd = NullComponent

export const [aiDevtoolsPlugin, aiDevtoolsNoOpPlugin] =
  createVuePlugin<AiDevtoolsVueInit>('TanStack AI', NullComponent)
