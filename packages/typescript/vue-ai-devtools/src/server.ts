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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const [aiDevtoolsPlugin, aiDevtoolsNoOpPlugin] =
  createVuePlugin<AiDevtoolsVueInit>('TanStack AI', NullComponent as any)
